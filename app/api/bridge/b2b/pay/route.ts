// POST /api/bridge/b2b/pay
//
// B2B via Bridge — sender business initiates payment after opening recipient's B2B link.
// Identical to /api/bridge/pay (P2P) but creates a BUSINESS sender customer (KYB)
// and tags the order as "b2b-bridge". Stripe+Wise B2B untouched.
//
// Flow:
//   1. Decrypt token → liquidation address + recipient business info
//   2. KYB the sender business in Bridge
//   3. Create Virtual Account for sender (USD/EUR/CAD → USDC → liquidation address)
//   4. Return: wire deposit instructions + fee quote + order ID for tracking

import { NextRequest, NextResponse }              from "next/server";
import { getOrCreateCustomer, getCustomer, getKycUrlFromCustomer, patchCustomerAddress, ensureEndorsements, createKycLink, simulateKycApproval, createTosLink } from "@/providers/bridge/customers";
import { getRate }                               from "@/lib/fx-server";
import { createVirtualAccount }                   from "@/providers/bridge/virtual-accounts";
import { decryptPayload }                         from "@/lib/accountcrypto";
import { buildDynamicQuote }                      from "@/lib/bridge-fees";
import { createOrder }                            from "@/lib/order-state";

export const runtime = "edge";

interface B2BPayBody {
  token:            string;
  business_name:    string;
  sender_email:     string;
  source_currency:  "usd" | "eur" | "gbp" | "mxn" | "brl" | "cop";
  sender_phone?:    string;
  redirect_uri?:    string;
}

const NETWORK_BY_CURRENCY: Record<string, "polygon" | "ethereum" | "solana"> = {
  usd: "polygon", eur: "polygon", gbp: "polygon", mxn: "polygon", brl: "polygon",
};

export async function POST(req: NextRequest): Promise<Response> {
  let body: B2BPayBody;
  try { body = await req.json() as B2BPayBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { token, business_name, sender_email, source_currency, sender_phone, redirect_uri } = body;

  if (!token || !business_name || !sender_email || !source_currency) {
    return NextResponse.json(
      { error: "token, business_name, sender_email, and source_currency are required" },
      { status: 400 },
    );
  }

  try {
    const decrypted = await decryptPayload(token);
    let meta: {
      liq_addr_id:       string;
      liq_addr_address:  string;
      customer_id:       string;
      nombre:            string;
      email?:            string;
      country:           string;
      target_currency:   string;
      amount_target:     number;
      receive_method:    string;
    };

    try { meta = JSON.parse(decrypted.account); }
    catch { return NextResponse.json({ error: "Invalid or tampered payment token" }, { status: 400 }); }

    if (!meta.liq_addr_address) {
      return NextResponse.json(
        { error: "Token does not contain liquidation address. Ask recipient to generate a new link." },
        { status: 400 },
      );
    }

    // Convert target amount to USD for quote
    let amountUSD = meta.amount_target;
    if (meta.target_currency && meta.target_currency !== "USD") {
      const rate = await getRate(meta.target_currency, "USD").catch(() => null);
      if (rate) amountUSD = parseFloat((meta.amount_target * rate).toFixed(2));
    }

    const quote = await buildDynamicQuote({
      amount:  amountUSD,
      country: meta.country,
      email:   sender_email.toLowerCase(),
      type:    "b2b",
    });

    // Get or create Bridge BUSINESS customer for the SENDER
    const { customer: senderCustomer, needsKyc: needsKyb, isNew } = await getOrCreateCustomer({
      type:          "business",
      email:         sender_email.toLowerCase(),
      business_name,
      endorsements:  ["base", "sepa"],
    });

    const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";

    if (isSandbox) {
      try { await ensureEndorsements(senderCustomer.id, ["base", "sepa"]); } catch { /* best-effort */ }
      try {
        await createKycLink({ full_name: business_name, email: sender_email.toLowerCase(), type: "business", endorsements: ["base", "sepa"] });
      } catch { /* duplicate_record = already pending */ }
      try { await simulateKycApproval(senderCustomer.id); } catch { /* may already be approved */ }

      // Poll up to 6 s — Bridge may take a moment to mark the business customer active
      let kybActive = false;
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const verified = await getCustomer(senderCustomer.id);
          kybActive = verified.status === "active" || verified.kyb_status === "approved";
          if (kybActive) break;
          if (i === 2) {
            try { await simulateKycApproval(senderCustomer.id); } catch { /* retry */ }
          }
        } catch { break; }
      }
      if (!kybActive) {
        return NextResponse.json({
          error: "La empresa emisora no pudo activarse en Bridge sandbox.",
          bridge_type: "kyb_not_active",
        }, { status: 422 });
      }

      // Set address AFTER KYB simulation — sandbox simulate may clear address fields.
      try {
        await patchCustomerAddress(senderCustomer.id, "US", false, "business");
      } catch (addrErr) {
        console.warn("[bridge/b2b/pay] patchCustomerAddress post-kyb:", (addrErr as Error).message);
      }
    } else {
      try {
        await patchCustomerAddress(senderCustomer.id, "US", false, "business");
      } catch (addrErr) {
        console.warn("[bridge/b2b/pay] patchCustomerAddress:", (addrErr as Error).message);
      }
    }

    // ToS gate for new business customers in production
    if (!isSandbox && isNew) {
      try {
        const tosLink = await createTosLink({ full_name: business_name, email: sender_email.toLowerCase(), type: "business" });
        return NextResponse.json({
          needs_tos: true,
          tos_url:   tosLink.url,
          message:   "La empresa debe aceptar los Términos de Bridge antes de continuar.",
        }, { status: 202 });
      } catch { /* proceed */ }
    }

    // KYB gate (production)
    const skipKyc = process.env.BRIDGE_SKIP_KYC === "true";
    if (needsKyb && !skipKyc && !isSandbox) {
      let kybUrl: string | null = getKycUrlFromCustomer(senderCustomer);
      if (!kybUrl) {
        try {
          const kycLink = await createKycLink({ full_name: business_name, email: sender_email.toLowerCase(), type: "business" });
          kybUrl = kycLink.url ?? kycLink.kyc_link ?? null;
        } catch { /* best-effort */ }
      }
      if (kybUrl && redirect_uri) {
        const sep = kybUrl.includes("?") ? "&" : "?";
        kybUrl = `${kybUrl}${sep}redirect_uri=${encodeURIComponent(redirect_uri)}`;
      }
      return NextResponse.json({
        needs_kyb:   true,
        kyb_url:     kybUrl,
        customer_id: senderCustomer.id,
        message:     "Completa la verificación KYB de tu empresa y vuelve a intentarlo.",
      }, { status: 202 });
    }

    const orderId = `OP-B2B-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const network = NETWORK_BY_CURRENCY[source_currency] ?? "polygon";
    const va = await createVirtualAccount({
      customerId:          senderCustomer.id,
      sourceCurrency:      source_currency,
      destinationAddress:  meta.liq_addr_address,
      destinationNetwork:  network,
      developerFeePercent: "0.50",
      reference:           orderId,
    });

    const senderLocale = req.cookies.get("OMNIPAY_LOCALE")?.value ?? "es";

    createOrder(orderId, {
      orderType:          "b2b-bridge",
      destinationCountry: meta.country,
      targetCurrency:     meta.target_currency,
      recipientName:      meta.nombre,
      recipientEmail:     meta.email,
      recipientAccount:   meta.liq_addr_id,
      payInProvider:      "bridge-va-b2b",
      payOutProvider:     "bridge-liq",
      amount:             amountUSD,
      senderEmail:        sender_email.toLowerCase(),
      trackUrl:           `${appUrl}/seguimiento?order_id=${orderId}`,
      senderLocale,
      recipientLocale:    "es",
    });

    const di = va.source_deposit_instructions;
    const railLabel = source_currency === "eur" ? "SEPA"
      : source_currency === "mxn" ? "SPEI"
      : source_currency === "brl" ? "PIX"
      : source_currency === "cop" ? "Bre-B"
      : source_currency === "gbp" ? "Faster Payments"
      : "ACH / Wire";

    return NextResponse.json({
      order_id:   orderId,
      status:     "PENDING_PAYIN",
      order_type: "b2b-bridge",
      deposit_instructions: {
        rail:                railLabel,
        currency:            source_currency.toUpperCase(),
        bank_name:           di.bank_name,
        bank_address:        di.bank_address,
        routing_number:      di.bank_routing_number,
        account_number:      di.bank_account_number,
        beneficiary_name:    di.bank_beneficiary_name,
        beneficiary_address: di.bank_beneficiary_address,
        iban:                di.iban,
        bic:                 di.bic,
        account_holder:      di.account_holder_name,
        clabe:               di.clabe,
        br_code:             di.br_code,
        sort_code:           di.sort_code,
        amount_to_deposit:   quote.total_sender_pays.toFixed(2),
        instructions:        `Transfiere exactamente ${quote.total_sender_pays.toFixed(2)} ${source_currency.toUpperCase()} vía ${railLabel}. La empresa receptora recibe en 1-2 días hábiles.`,
      },
      fee_breakdown: {
        amount_principal: quote.amount_principal,
        provider:         quote.provider,
        bridge_onramp:    quote.bridge_onramp,
        bridge_offramp:   quote.bridge_offramp,
        provider_cost:    quote.provider_cost_total,
        omnipay_service:  quote.omnipay_service,
        omnipay_flat:     quote.omnipay_flat,
        kyb_surcharge:    quote.kyc_surcharge,
        is_new_customer:  quote.is_new_customer,
        total_to_send:    quote.total_sender_pays,
        recipient_gets:   `${meta.amount_target.toLocaleString()} ${meta.target_currency}`,
      },
      recipient:  { name: meta.nombre, country: meta.country, method: meta.receive_method },
      needs_kyb:  false,
      is_sandbox: isSandbox,
      track_url:  `${appUrl}/api/bridge/track?order_id=${orderId}`,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/b2b/pay]", err.message, err.type, err.status, JSON.stringify(err.details));

    const msg = err.message ?? "";
    if (msg.toLowerCase().includes("not fully enabled") || msg.toLowerCase().includes("virtual account")) {
      const currencyMatch = msg.match(/\b([A-Z]{3})\b/);
      const currency = currencyMatch?.[1] ?? source_currency?.toUpperCase() ?? "";
      return NextResponse.json({
        error: `${currency} no está habilitado en nuestra cuenta Bridge para envíos de esa moneda.`,
        currency_not_enabled: currency,
      }, { status: 422 });
    }

    const detail = err.details ? JSON.stringify(err.details) : "";
    console.error("[bridge/b2b/pay] unhandled:", err.message, detail);
    return NextResponse.json({
      error: err.message + (detail ? ` — ${detail}` : ""),
    }, { status: err.status ?? 500 });
  }
}
