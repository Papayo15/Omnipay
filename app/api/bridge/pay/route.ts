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
import { getOrCreateCustomer, getKycLink, patchCustomerAddress, createKycLink, simulateKycApproval } from "@/providers/bridge/customers";
import { createVirtualAccount }                   from "@/providers/bridge/virtual-accounts";
import { decryptPayload }                         from "@/lib/accountcrypto";
import { buildDynamicQuote }                      from "@/lib/bridge-fees";
import { createOrder }                            from "@/lib/order-state";

export const runtime = "edge";

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
      liq_addr_id:       string;
      liq_addr_address:  string;  // USDC Polygon address
      customer_id:       string;
      nombre:            string;
      country:           string;
      target_currency:   string;
      amount_target:     number;
      receive_method:    string;
      recipient_phone?:  string;
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

    if (isSandbox) {
      try {
        await createKycLink({ full_name: sender_name, email: sender_email.toLowerCase(), type: "individual", endorsements: ["base", "sepa"] });
      } catch (e) {
        const ke = e as Error & { type?: string };
        if (ke.type !== "duplicate_record") throw ke; // surface non-duplicate errors
      }
      await simulateKycApproval(senderCustomer.id); // must succeed for VA creation
    }

    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";
    const orderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 4. Create Virtual Account for sender
    // Bridge flow: sender deposits fiat → VA converts to USDC → sends to liquidation address
    // → liquidation address auto-pays receptor's bank/card
    const network = NETWORK_BY_CURRENCY[source_currency] ?? "polygon";
    const va = await createVirtualAccount({
      customerId:          senderCustomer.id,
      sourceCurrency:      source_currency,
      destinationAddress:  meta.liq_addr_address,  // USDC Polygon address of liquidation addr
      destinationNetwork:  network,
      developerFeePercent: "0.50",  // OmniPay's 0.50% collected automatically by Bridge
      reference:           orderId,
    });

    // 5. Create local in-memory order for tracking
    createOrder(orderId, {
      destinationCountry: meta.country,
      targetCurrency:     meta.target_currency,
      recipientName:      meta.nombre,
      recipientAccount:   meta.liq_addr_id,
      payInProvider:      "bridge-va",
      payOutProvider:     "bridge-liq",
    });

    // 6. KYC link for sender if needed (non-blocking)
    let kycUrl: string | null = null;
    if (needsKyc) {
      try {
        const kycLink = await getKycLink(senderCustomer.id);
        kycUrl = kycLink.url ?? kycLink.kyc_link ?? null;
      } catch { /* non-critical */ }
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
        instructions:        `Deposita exactamente ${quote.total_sender_pays.toFixed(2)} ${source_currency.toUpperCase()} a esta cuenta. Bridge convertirá y enviará automáticamente a ${meta.nombre} en ${meta.country}.`,
      },
      fee_breakdown: {
        amount_principal:  quote.amount_principal,
        provider:          quote.provider,
        bridge_onramp:     quote.bridge_onramp,
        bridge_offramp:    quote.bridge_offramp,
        paysend_cost:      quote.paysend_cost,
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
      needs_kyc:  needsKyc,
      kyc_url:    kycUrl,
      track_url:  `${appUrl}/api/bridge/track?order_id=${orderId}`,
      sender_phone: sender_phone ?? null,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/pay]", err.message, err.type, err.status, JSON.stringify(err.details));
    return NextResponse.json({
      error:          err.message,
      bridge_type:    err.type ?? null,
      bridge_details: err.details ?? null,
    }, { status: err.status ?? 500 });
  }
}
