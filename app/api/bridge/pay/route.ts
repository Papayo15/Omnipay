// POST /api/bridge/pay
//
// EMISOR (sender) initiates payment after opening the receptor's link.
// Flow:
//   1. Decrypt token → get liquidation address (USDC/Polygon) + receptor info
//   2. KYC the sender in Bridge
//   3. Create Virtual Account for sender (USD/EUR/etc → USDC → liquidation address)
//   4. Return: bank deposit instructions + fee quote + order ID for tracking
//
// Bridge handles: fiat deposit → convert to USDC → send to liquidation address →
//                 liquidation address auto-pays receptor via SPEI/card/ACH etc.

import { NextRequest, NextResponse }              from "next/server";
import { getOrCreateCustomer, getCustomer, getKycLink, getKycUrlFromCustomer, patchCustomerAddress, ensureEndorsements, createKycLink, simulateKycApproval, createTosLink } from "@/providers/bridge/customers";
import { createVirtualAccount }                   from "@/providers/bridge/virtual-accounts";
import { decryptPayload }                         from "@/lib/accountcrypto";
import { buildDynamicQuote }                      from "@/lib/bridge-fees";
import { createOrder }                            from "@/lib/order-state";
import { getRedis }                               from "@/lib/redis";

// nodejs required — Redis TCP sockets incompatible with Edge
export const runtime = "nodejs";

interface PayBody {
  token:           string;   // encrypted token from /api/bridge/checkout
  sender_name:     string;
  sender_email:    string;
  source_currency: "usd" | "eur" | "gbp" | "mxn" | "brl";
  sender_phone?:   string;
}

// Which Polygon/Ethereum network to use per source currency
const NETWORK_BY_CURRENCY: Record<string, "polygon" | "ethereum" | "solana"> = {
  usd: "polygon",
  eur: "polygon",
  gbp: "polygon",
  mxn: "polygon",
  brl: "polygon",
};

export async function POST(req: NextRequest): Promise<Response> {
  let body: PayBody;
  try { body = await req.json() as PayBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { token, sender_name, sender_email, source_currency, sender_phone } = body;

  if (!token || !sender_name || !sender_email || !source_currency) {
    return NextResponse.json(
      { error: "token, sender_name, sender_email, and source_currency are required" },
      { status: 400 },
    );
  }

  try {
    // 1. Decrypt token — contains receptor's liquidation address + order metadata
    const decrypted = await decryptPayload(token);
    let meta: {
      liq_addr_id:        string;
      liq_addr_address:   string;  // USDC Polygon address
      customer_id:        string;
      nombre:             string;
      country:            string;
      target_currency:    string;
      amount_target:      number;
      receive_method:     string;
      recipient_phone?:   string;
      recipient_locale?:  string;
    };

    try { meta = JSON.parse(decrypted.account); }
    catch { return NextResponse.json({ error: "Invalid or tampered payment token" }, { status: 400 }); }

    if (!meta.liq_addr_address) {
      return NextResponse.json(
        { error: "Token does not contain liquidation address. Ask receptor to generate a new link." },
        { status: 400 },
      );
    }

    // 2. Convert amount_target (local currency) → USD for the quote
    // meta.amount_target is what the receptor wants to receive in meta.target_currency (e.g. 3000 MXN)
    // We need to send USD into the virtual account, so convert first.
    let amountUSD = meta.amount_target;
    if (meta.target_currency && meta.target_currency !== "USD") {
      try {
        const fxRes = await fetch(
          `https://open.er-api.com/v6/latest/${meta.target_currency}`,
          { cache: "no-store" },
        );
        if (fxRes.ok) {
          const fxData = await fxRes.json() as { rates?: Record<string, number> };
          const rate = fxData.rates?.USD;
          if (rate) amountUSD = parseFloat((meta.amount_target * rate).toFixed(2));
        }
      } catch { /* use amount_target as-is if FX lookup fails */ }
    }

    // Minimum amount guard — prevents uneconomical transactions
    if (amountUSD < 20) {
      return NextResponse.json(
        { error: "El monto mínimo de envío es $20 USD." },
        { status: 400 },
      );
    }

    // 2b. Build fee quote with dynamic KYC check for the SENDER
    const quote = await buildDynamicQuote({
      amount:  amountUSD,
      country: meta.country,
      email:   sender_email.toLowerCase(),
      type:    "p2p",
    });

    // 3. Get or create Bridge customer for the SENDER (KYC)
    const { customer: senderCustomer, needsKyc } = await getOrCreateCustomer({
      type:        "individual",
      email:       sender_email.toLowerCase(),
      first_name:  sender_name.split(" ")[0],
      last_name:   sender_name.split(" ").slice(1).join(" ") || "-",
      endorsements: ["base", "sepa"],
    });

    const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

    // Patch address + compliance fields (same as checkout receiver flow)
    try { await patchCustomerAddress(senderCustomer.id, "US", true); } catch { /* best-effort */ }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";

    if (isSandbox) {
      try { await ensureEndorsements(senderCustomer.id, ["base", "sepa"]); } catch { /* best-effort */ }
      try {
        await createKycLink({ full_name: sender_name, email: sender_email.toLowerCase(), type: "individual", endorsements: ["base", "sepa"] });
      } catch { /* duplicate_record = already pending, fine */ }
      try { await simulateKycApproval(senderCustomer.id); } catch (simErr) {
        console.warn(`[bridge/pay] simulateKycApproval: ${(simErr as Error).message}`);
      }
      // Poll until active — sandbox KYC approval is async; createVirtualAccount needs active status
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const verified = await getCustomer(senderCustomer.id);
          const isActive = verified.status === "active" || verified.kyc_status === "approved";
          console.log(`[bridge/pay] sender poll ${i + 1}/6: id=${senderCustomer.id} status=${verified.status} kyc=${verified.kyc_status} active=${isActive}`);
          if (isActive) break;
          // Retry simulate on 3rd attempt — sometimes Bridge needs a second call
          if (i === 2) {
            try { await simulateKycApproval(senderCustomer.id); } catch { /* retry, ignore error */ }
          }
        } catch { break; }
      }
    }

    // KYC gate (production) — same pattern as checkout/route.ts
    // Must run AFTER sandbox simulate so sandbox flow is never blocked here
    const skipKyc = process.env.BRIDGE_SKIP_KYC === "true";
    if (needsKyc && !skipKyc && !isSandbox) {
      let kycUrl: string | null = getKycUrlFromCustomer(senderCustomer);
      if (!kycUrl) {
        try {
          const kycLink = await getKycLink(senderCustomer.id);
          kycUrl = kycLink.url ?? kycLink.kyc_link ?? null;
        } catch { /* best-effort */ }
      }
      return NextResponse.json({
        needs_kyc:   true,
        kyc_url:     kycUrl,
        customer_id: senderCustomer.id,
        message:     "Completa tu verificación de identidad y vuelve a intentarlo.",
      }, { status: 202 });
    }

    const orderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 4. Create Virtual Account for sender
    // Bridge flow: sender deposits fiat → VA converts to USDC → sends to liquidation address
    // → liquidation address auto-pays receptor's bank/card
    //
    // "Efecto Memoria": VA is STATIC — same sender+recipient always gets the same VA
    // (same routing number + account number). Sender saves details once in their bank app
    // and all future transfers arrive automatically without visiting OmniPay again.
    const network = NETWORK_BY_CURRENCY[source_currency] ?? "polygon";
    const va = await createVirtualAccount({
      customerId:          senderCustomer.id,
      sourceCurrency:      source_currency,
      destinationAddress:  meta.liq_addr_address,
      destinationNetwork:  network,
      developerFeePercent: "0.50",  // OmniPay's 0.50% collected automatically by Bridge
      // Stable reference — uses liq_addr_id so same VA is returned on repeat sends
      // (idempotency key: va-{customerId}-{liqAddrId})
      reference:           meta.liq_addr_id,
      developerReference:  `liq-${meta.liq_addr_id}`,  // appears in deposit_received webhook
    });

    // Sender's locale from cookie (for email i18n)
    const senderLocale = req.cookies.get("OMNIPAY_LOCALE")?.value ?? "es";

    // 5. Create local in-memory order for tracking
    createOrder(orderId, {
      orderType:          "p2p",
      destinationCountry: meta.country,
      targetCurrency:     meta.target_currency,
      recipientName:      meta.nombre,
      recipientAccount:   meta.liq_addr_id,
      payInProvider:      "bridge-va",
      payOutProvider:     "bridge-liq",
      amount:             amountUSD,
      senderEmail:        sender_email.toLowerCase(),
      recipientEmail:     (meta as { email?: string }).email ?? undefined,
      trackUrl:           `${appUrl}/seguimiento?order_id=${orderId}`,
      senderLocale,
      recipientLocale:    meta.recipient_locale ?? "es",
    });

    // 6. Store VA metadata in Redis for "Efecto Memoria" — no PII, only routing identifiers.
    // When sender deposits directly from their bank (bypassing OmniPay), the webhook uses
    // this to auto-create a tracking order. TTL: 1 year (VA is permanent in Bridge).
    if (process.env.REDIS_URL) {
      try {
        const redis = await getRedis();
        await redis.set(`va:${va.id}`, JSON.stringify({
          liq_addr_id:         meta.liq_addr_id,
          destination_country: meta.country,
          target_currency:     meta.target_currency,
          source_currency,
        }), { EX: 365 * 86400 });
      } catch { /* best-effort — failure here doesn't block the payment */ }
    }

    const di = va.source_deposit_instructions;
    const railLabel = source_currency === "eur" ? "SEPA"
      : source_currency === "mxn" ? "SPEI"
      : source_currency === "brl" ? "PIX"
      : source_currency === "gbp" ? "Faster Payments"
      : "ACH / Wire";

    return NextResponse.json({
      order_id:       orderId,
      status:         "PENDING_PAYIN",
      // Deposit instructions the sender uses to fund the VA
      deposit_instructions: {
        rail:                railLabel,
        currency:            source_currency.toUpperCase(),
        // USD ACH/Wire
        bank_name:           di.bank_name,
        bank_address:        di.bank_address,
        routing_number:      di.bank_routing_number,
        account_number:      di.bank_account_number,
        beneficiary_name:    di.bank_beneficiary_name,
        beneficiary_address: di.bank_beneficiary_address,
        // EUR SEPA
        iban:                di.iban,
        bic:                 di.bic,
        account_holder:      di.account_holder_name,
        // MXN SPEI
        clabe:               di.clabe,
        // BRL PIX
        br_code:             di.br_code,
        // GBP
        sort_code:           di.sort_code,
        payment_rails:       di.payment_rails,
        // What to deposit
        amount_to_deposit:   quote.total_sender_pays.toFixed(2),
        instructions:        `Deposita exactamente ${quote.total_sender_pays.toFixed(2)} ${source_currency.toUpperCase()} a esta cuenta. Bridge convierte al instante y ${meta.nombre} recibe en minutos vía ${meta.country === "MX" ? "SPEI" : meta.country === "BR" ? "PIX" : meta.country === "GB" ? "Faster Payments" : "transferencia local"}.`,
      },
      fee_breakdown: {
        amount_principal:  quote.amount_principal,
        provider:          quote.provider,
        bridge_onramp:     quote.bridge_onramp,
        bridge_offramp:    quote.bridge_offramp,
        provider_cost:     quote.provider_cost_total,
        omnipay_service:   quote.omnipay_service,
        omnipay_flat:      quote.omnipay_flat,
        kyc_surcharge:     quote.kyc_surcharge,
        is_new_customer:   quote.is_new_customer,
        total_to_send:     quote.total_sender_pays,
        recipient_gets:    `${meta.amount_target.toLocaleString("es-MX")} ${meta.target_currency}`,
      },
      recipient: {
        name:    meta.nombre,
        country: meta.country,
        method:  meta.receive_method,
      },
      needs_kyc:  false,
      kyc_url:    null,
      is_sandbox: isSandbox,
      track_url:  `${appUrl}/api/bridge/track?order_id=${orderId}`,
      sender_phone: sender_phone ?? null,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/pay]", err.message, err.type, err.status, JSON.stringify(err.details));

    // Friendly message for currency not enabled on Bridge account.
    // Bridge returns "not fully enabled" in err.message OR buried in err.details.source.key
    const msg = err.message ?? "";
    const detailsStr = JSON.stringify(err.details ?? "");
    const notEnabled = msg.toLowerCase().includes("not fully enabled")
      || detailsStr.toLowerCase().includes("not fully enabled");
    if (notEnabled) {
      // Extract the 3-letter currency from the details string or the source_currency
      const currencyMatch = detailsStr.match(/\b([A-Z]{3})\b/) ?? msg.match(/\b([A-Z]{3})\b/);
      const currency = currencyMatch?.[1] ?? source_currency?.toUpperCase() ?? "";
      console.warn(`[bridge/pay] currency not enabled: ${currency}`);
      return NextResponse.json({
        error: `${currency} no está habilitado aún en nuestra cuenta Bridge. Por el momento usa USD o EUR. Estamos activando más monedas — contáctanos si necesitas ${currency} urgente.`,
        currency_not_enabled: currency,
      }, { status: 422 });
    }

    return NextResponse.json({
      error:          err.message,
      bridge_type:    err.type ?? null,
      bridge_details: err.details ?? null,
    }, { status: err.status ?? 500 });
  }
}
