// POST /api/bridge/b2b/send
//
// Sender-side onboarding — B2B unified endpoint.
// The SENDER BUSINESS is the Bridge customer (KYB'd). The RECIPIENT BUSINESS is only
// an External Account (bank details as payout destination). No KYB required from recipient.
//
// Flow:
//   1. Create/get Bridge business customer for the SENDER (KYB)
//   2. KYB gate: if not verified → return kyb_url (202) so UI can redirect sender
//   3. Create External Account + Liquidation Address under SENDER's customer
//      (ownerName = recipient business name, ownerType = "business")
//   4. Create Virtual Account for SENDER
//   5. Return deposit instructions + fee breakdown + order ID

import { NextRequest, NextResponse }        from "next/server";
import {
  getOrCreateCustomer, getKycUrlFromCustomer,
  patchCustomerAddress, ensureEndorsements, createKycLink,
  createTosLink, ALPHA2_TO_ALPHA3, RAIL_ENDORSEMENT,
} from "@/providers/bridge/customers";
import { createLiquidationAddress, ensureExternalAccount, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams } from "@/providers/bridge/liquidation";
import { createVirtualAccount }             from "@/providers/bridge/virtual-accounts";
import { buildDynamicQuote }                from "@/lib/bridge-fees";
import { createOrder }                      from "@/lib/order-state";
import { getRate }                          from "@/lib/fx-server";
import { getTargetCurrency }                from "@/lib/routing";

export const runtime = "nodejs";

const B2B_ENDORSEMENTS = ["base", "sepa", "spei", "pix", "faster_payments", "cop"];

const NETWORK_BY_CURRENCY: Record<string, "polygon" | "ethereum" | "solana"> = {
  usd: "polygon", eur: "polygon", gbp: "polygon", mxn: "polygon", brl: "polygon", cop: "polygon",
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  usd: "US", eur: "DE", gbp: "GB", mxn: "MX", brl: "BR", cop: "CO",
};

interface B2BSendBody {
  // Sender business (Bridge customer — KYB'd)
  sender_business_name: string;
  sender_email:         string;
  source_currency:      "usd" | "eur" | "gbp" | "mxn" | "brl" | "cop";
  redirect_uri?:        string;
  // Recipient business bank details (External Account only — no Bridge customer)
  recipient_business_name: string;
  recipient_country:    string;
  clabe?:               string;
  iban?:                string;
  bic?:                 string;
  pix_key?:             string;
  routing_number?:      string;
  account_number?:      string;
  sort_code?:           string;
  bank_name?:           string;
  bank_code?:           string;
  amount_target:        number;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: B2BSendBody;
  try { body = await req.json() as B2BSendBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    sender_business_name, sender_email, source_currency, redirect_uri,
    recipient_business_name, recipient_country,
    clabe, iban, bic, pix_key, routing_number, account_number,
    sort_code, bank_name, bank_code,
    amount_target,
  } = body;

  if (!sender_business_name || !sender_email || !source_currency || !recipient_business_name || !recipient_country || !amount_target) {
    return NextResponse.json(
      { error: "sender_business_name, sender_email, source_currency, recipient_business_name, recipient_country, amount_target son requeridos" },
      { status: 400 },
    );
  }

  const country = recipient_country.toUpperCase();
  if (!NATIVE_RAILS[country]) {
    return NextResponse.json(
      { error: "País del receptor no soportado. Disponibles: MX, US, BR, CO, GB y zona SEPA." },
      { status: 400 },
    );
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

  try {
    const targetCurrency = getTargetCurrency(country);
    let amountUSD = amount_target;
    if (targetCurrency !== "USD") {
      const rate = await getRate(targetCurrency, "USD").catch(() => null);
      if (rate) amountUSD = parseFloat((amount_target * rate).toFixed(2));
    }

    if (amountUSD < 50) {
      return NextResponse.json(
        { error: `Monto mínimo para B2B Wire es $50 USD. Monto calculado: $${amountUSD.toFixed(2)} USD.` },
        { status: 400 },
      );
    }

    // 1. Get or create Bridge business customer for the SENDER
    const { customer: senderCustomer, needsKyc: needsKyb, isNew } = await getOrCreateCustomer({
      type:          "business",
      email:         sender_email.toLowerCase(),
      business_name: sender_business_name,
      country:       ALPHA2_TO_ALPHA3[CURRENCY_TO_COUNTRY[source_currency] ?? "US"] ?? "USA",
      endorsements:  B2B_ENDORSEMENTS,
    });

    const senderCountry = CURRENCY_TO_COUNTRY[source_currency] ?? "US";
    try {
      await patchCustomerAddress(senderCustomer.id, senderCountry, false, "business", sender_business_name);
    } catch (addrErr) {
      console.warn("[bridge/b2b/send] patchCustomerAddress:", (addrErr as Error).message);
    }

    // 2. Sandbox KYB gate — return needs_kyb so UI can show the Simular button
    if (isSandbox && needsKyb) {
      const kybRedirectUri = redirect_uri ?? `${appUrl}/enviar-empresa-wire?kyb_done=1`;
      return NextResponse.json({
        needs_kyb:   true,
        kyb_url:     null,
        customer_id: senderCustomer.id,
        is_sandbox:  true,
        message:     "Sandbox: usa el botón Simular KYB para continuar.",
        redirect_uri: kybRedirectUri,
      }, { status: 202 });
    }

    // 3. ToS gate for new sender business in production
    if (!isSandbox && isNew) {
      const kybRedirectUri = redirect_uri ?? `${appUrl}/enviar-empresa-wire?kyb_done=1`;
      try {
        const tosLink = await createTosLink({
          full_name:    sender_business_name,
          email:        sender_email.toLowerCase(),
          type:         "business",
          redirect_uri: kybRedirectUri,
        });
        return NextResponse.json({
          needs_tos: true,
          tos_url:   tosLink.url,
          message:   "Tu empresa debe aceptar los Términos de Bridge antes de continuar.",
        }, { status: 202 });
      } catch { /* proceed */ }
    }

    // 4. KYB gate (production)
    const skipKyc = process.env.BRIDGE_SKIP_KYC === "true";
    if (needsKyb && !skipKyc && !isSandbox) {
      const kybRedirectUri = redirect_uri ?? `${appUrl}/enviar-empresa-wire?kyb_done=1`;
      let kybUrl: string | null = getKycUrlFromCustomer(senderCustomer);
      if (!kybUrl) {
        try {
          const kl = await createKycLink({
            full_name:    sender_business_name,
            email:        sender_email.toLowerCase(),
            type:         "business",
            endorsements: B2B_ENDORSEMENTS,
            redirect_uri: kybRedirectUri,
          });
          kybUrl = kl.url ?? (kl as unknown as Record<string, string>).kyc_link ?? null;
        } catch (e1) {
          const err1 = e1 as Error & { type?: string; details?: Record<string, unknown> };
          if (err1.type === "duplicate_record") {
            const ex = err1.details?.existing_kyc_link as { kyc_link?: string; url?: string } | undefined;
            kybUrl = ex?.kyc_link ?? ex?.url ?? null;
          }
        }
      }
      if (kybUrl) {
        const sep = kybUrl.includes("?") ? "&" : "?";
        kybUrl = `${kybUrl}${sep}redirect_uri=${encodeURIComponent(kybRedirectUri)}`;
      }
      return NextResponse.json({
        needs_kyb:   true,
        kyb_url:     kybUrl,
        customer_id: senderCustomer.id,
        message:     "Completa la verificación KYB de tu empresa y vuelve a intentarlo.",
      }, { status: 202 });
    }

    // 5. Ensure endorsements for rail
    const railEndorsement  = RAIL_ENDORSEMENT[country];
    const fullEndorsements = railEndorsement && !B2B_ENDORSEMENTS.includes(railEndorsement)
      ? [...B2B_ENDORSEMENTS, railEndorsement]
      : B2B_ENDORSEMENTS;
    try { await ensureEndorsements(senderCustomer.id, fullEndorsements); } catch { /* best-effort */ }

    // 6. Create External Account + Liquidation Address under SENDER's customer.
    //    ownerName = recipient business name for the bank transfer beneficiary on payout.
    const liqParams: CreateLiquidationParams = {
      customerId:    senderCustomer.id,
      country,
      receiveMethod: "bank",
      ownerName:     recipient_business_name,
      ownerType:     "business",
      clabe, iban, bic, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      bankName: bank_name, sortCode: sort_code, bankCode: bank_code,
    };
    try { await ensureExternalAccount(liqParams); } catch { /* best-effort */ }

    const isNotActive = (e: unknown) =>
      (e as Error)?.message?.toLowerCase().includes("endorsement")
      || (e as Error)?.message?.toLowerCase().includes("not active");

    let liqAddr: { id: string; address: string };
    try {
      liqAddr = await createLiquidationAddress(liqParams);
    } catch (e1) {
      if (!isNotActive(e1)) throw e1;
      await new Promise(r => setTimeout(r, 5000));
      try { await ensureEndorsements(senderCustomer.id, fullEndorsements); } catch { /* ignore */ }
      liqAddr = await createLiquidationAddress(liqParams);
    }

    // 7. Fee quote
    const quote = await buildDynamicQuote({
      amount:  amountUSD,
      country,
      email:   sender_email.toLowerCase(),
      type:    "b2b",
    });

    // 8. Create Virtual Account for sender
    const network   = NETWORK_BY_CURRENCY[source_currency] ?? "polygon";
    const orderId   = `OP-B2B-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const va = await createVirtualAccount({
      customerId:          senderCustomer.id,
      sourceCurrency:      source_currency,
      destinationAddress:  liqAddr.address,
      destinationNetwork:  network,
      developerFeePercent: "0.50",
      reference:           orderId,
      developerReference:  `liq-${liqAddr.id}`,
    });

    // 9. Create tracking order
    const senderLocale = req.cookies.get("OMNIPAY_LOCALE")?.value ?? "es";
    createOrder(orderId, {
      orderType:          "b2b-bridge",
      destinationCountry: country,
      targetCurrency,
      recipientName:      recipient_business_name,
      recipientAccount:   liqAddr.id,
      payInProvider:      "bridge-va",
      payOutProvider:     "bridge-liq",
      amount:             amountUSD,
      senderEmail:        sender_email.toLowerCase(),
      trackUrl:           `${appUrl}/api/bridge/track?order_id=${orderId}`,
      senderLocale,
    });

    const di = va.source_deposit_instructions;
    const railLabel = source_currency === "eur" ? "SEPA"
      : source_currency === "mxn" ? "SPEI"
      : source_currency === "brl" ? "PIX"
      : source_currency === "gbp" ? "Faster Payments"
      : source_currency === "cop" ? "COP"
      : "ACH / Wire";

    return NextResponse.json({
      order_id: orderId,
      status:   "PENDING_PAYIN",
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
        payment_rails:       di.payment_rails,
        amount_to_deposit:   quote.total_sender_pays.toFixed(2),
        instructions:        `Deposita exactamente ${quote.total_sender_pays.toFixed(2)} ${source_currency.toUpperCase()} a esta cuenta.`,
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
        recipient_gets:   `${amount_target.toLocaleString("es-MX")} ${targetCurrency}`,
      },
      recipient: {
        name:    recipient_business_name,
        country,
        method:  "bank",
      },
      target_currency:  targetCurrency,
      amount_target,
      needs_kyb:  false,
      is_sandbox: isSandbox,
      track_url:  `${appUrl}/api/bridge/track?order_id=${orderId}`,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/b2b/send]", err.message, err.type, JSON.stringify(err.details ?? {}));
    return NextResponse.json({ error: err.message ?? "Error interno" }, { status: err.status ?? 500 });
  }
}
