// POST /api/conduit/send
//
// Conduit payment initiation — stateless VA + Payout pattern.
// OmniPay is a PLATFORM customer on Conduit (one CONDUIT_CUSTOMER_ID covers all transfers).
// Individual senders are NOT Conduit customers — no per-user onboarding needed.
//
// Flow:
//   1. Create a Virtual Account under OmniPay's platform customer ID
//   2. Poll until VA is active (deposit instructions available)
//   3. Create a Payout from VA → recipient's bank (POST /payouts)
//   4. Return VA deposit instructions to client → stored in localStorage (stateless)

import { NextRequest, NextResponse }             from "next/server";
import { getConduitCustomerId }                  from "@/lib/conduit/customers";
import { createConduitVA }                       from "@/lib/conduit/virtual-accounts";
import { createConduitPayout }                   from "@/lib/conduit/payouts";
import type { ConduitRecipient }                 from "@/lib/conduit/payouts";
import { isConduitSandbox }                      from "@/lib/conduit/client";
import { calcStaticQuote }                       from "@/lib/bridge-fees";
import { getRate }                               from "@/lib/fx-server";
import { getTargetCurrency }                     from "@/lib/routing";

export const runtime = "nodejs"; // setTimeout for VA polling

interface SendBody {
  sender_name:       string;
  sender_email:      string;
  source_currency:   string;
  recipient_name:    string;
  recipient_country: string;
  // Recipient bank (one of these combos):
  clabe?:            string;   // SPEI — Mexico
  iban?:             string;   // SEPA — EU
  bic?:              string;   // SEPA
  pix_key?:          string;   // PIX — Brazil
  routing_number?:   string;   // ACH / Fedwire — US
  account_number?:   string;
  sort_code?:        string;   // FPS — UK
  amount_target:     number;
}

// Country → rail mapping
// TODO: Confirm SPEI support with Conduit before activating Mexico corridor
const RAIL_MAP: Record<string, { rail: string; currency: string }> = {
  MX: { rail: "spei",  currency: "MXN" },
  US: { rail: "ach",   currency: "USD" },
  BR: { rail: "pix",   currency: "BRL" },
  GB: { rail: "fps",   currency: "GBP" },
  DE: { rail: "sepa",  currency: "EUR" },
  FR: { rail: "sepa",  currency: "EUR" },
  ES: { rail: "sepa",  currency: "EUR" },
  IT: { rail: "sepa",  currency: "EUR" },
  NL: { rail: "sepa",  currency: "EUR" },
  PT: { rail: "sepa",  currency: "EUR" },
  CO: { rail: "local", currency: "COP" },
};

function buildRecipient(body: SendBody, country: string): ConduitRecipient {
  const rail = RAIL_MAP[country]?.rail;
  const base  = { name: body.recipient_name };
  if (rail === "spei")  return { ...base, clabe: body.clabe };
  if (rail === "pix")   return { ...base, pixKey: body.pix_key };
  if (rail === "fps")   return { ...base, sortCode: body.sort_code, accountNumber: body.account_number };
  if (rail === "sepa")  return { ...base, iban: body.iban, bic: body.bic };
  // ACH / local / fedwire
  return { ...base, routingNumber: body.routing_number, accountNumber: body.account_number };
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: SendBody;
  try { body = await req.json() as SendBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    sender_name, sender_email, source_currency,
    recipient_name, recipient_country, amount_target,
  } = body;

  if (!sender_name || !sender_email || !source_currency || !recipient_name || !recipient_country || !amount_target) {
    return NextResponse.json(
      { error: "sender_name, sender_email, source_currency, recipient_name, recipient_country, amount_target son requeridos" },
      { status: 400 },
    );
  }

  const country = recipient_country.toUpperCase();
  if (!RAIL_MAP[country]) {
    return NextResponse.json(
      { error: "País del receptor no soportado por Conduit." },
      { status: 400 },
    );
  }

  const isSandbox = isConduitSandbox();
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";

  try {
    // OmniPay's platform customer ID (pre-provisioned in Conduit dashboard)
    const customerId = getConduitCustomerId();

    // Convert recipient amount → USD for fee engine
    const targetCurrency = getTargetCurrency(country);
    let amountUSD = amount_target;
    if (targetCurrency !== "USD") {
      const rate = await getRate(targetCurrency, "USD").catch(() => null);
      if (rate) amountUSD = parseFloat((amount_target * rate).toFixed(2));
    }

    if (amountUSD < 20) {
      return NextResponse.json({ error: "El monto mínimo de envío es $20 USD equivalente." }, { status: 400 });
    }

    // Build fee quote
    let quote;
    try {
      quote = calcStaticQuote(amountUSD, country, "p2p", true);
    } catch {
      return NextResponse.json({ error: "Country not supported" }, { status: 422 });
    }

    // 1. Create Virtual Account under OmniPay's platform customer (on-demand, stateless)
    // 2. Poll until VA is active (deposit instructions available)
    const activeVA = await createConduitVA(customerId, "USD");

    // 3. Create Payout: VA → recipient's bank
    // POST /payouts — this is the correct endpoint for fiat bank payouts (not POST /orders)
    const orderId    = `OPC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const recipient  = buildRecipient(body, country);
    const railInfo   = RAIL_MAP[country];

    await createConduitPayout({
      customerId,
      virtualAccountId:  activeVA.id,
      rail:              railInfo.rail,
      amount:            quote.total_sender_pays,
      assetCode:         "USD",
      recipient,
      purpose:           "personal_transfer",
      clientReferenceId: orderId,  // OPC- ID for webhook correlation
    });

    // 4. Convert deposit amount to source currency for display
    const usdToSource = source_currency.toLowerCase() === "usd"
      ? 1
      : (await getRate("USD", source_currency.toUpperCase()).catch(() => null)) ?? 1;
    const depositAmountInSource = parseFloat((quote.total_sender_pays * usdToSource).toFixed(2));

    // Build deposit instructions from active VA
    const di = activeVA.depositInstructions;
    const usDomestic = di.find(i => i.type === "us_domestic");
    const sepa       = di.find(i => i.type === "sepa");
    const swift      = di.find(i => i.type === "swift");

    const railLabel = source_currency.toLowerCase() === "eur" ? "SEPA"
      : source_currency.toLowerCase() === "gbp" ? "Faster Payments"
      : source_currency.toLowerCase() === "mxn" ? "SPEI"
      : "ACH / Wire";

    return NextResponse.json({
      order_id: orderId,
      status:   "PENDING_PAYIN",
      provider: "conduit",
      deposit_instructions: {
        rail:              railLabel,
        currency:          source_currency.toUpperCase(),
        routing_number:    usDomestic?.routingNumber,
        account_number:    usDomestic?.accountNumber,
        beneficiary_name:  usDomestic?.beneficiaryName ?? swift?.beneficiaryName,
        bank_name:         usDomestic?.bankName ?? swift?.bankName,
        iban:              sepa?.iban ?? swift?.iban,
        bic:               sepa?.bic  ?? swift?.bic,
        payment_reference: di.find(i => i.paymentReferenceRequired)?.paymentReference,
        amount_to_deposit: depositAmountInSource.toFixed(2),
        instructions:      `Deposita exactamente ${depositAmountInSource.toFixed(2)} ${source_currency.toUpperCase()} a esta cuenta.`,
      },
      fee_breakdown: {
        amount_principal: quote.amount_principal,
        provider:         "conduit",
        omnipay_service:  quote.omnipay_service,
        total_to_send:    quote.total_sender_pays,
        recipient_gets:   `${amount_target.toLocaleString("es-MX")} ${targetCurrency}`,
      },
      recipient: {
        name:    recipient_name,
        country,
        method:  "bank",
        rail:    railInfo.rail,
      },
      target_currency: targetCurrency,
      amount_target,
      is_sandbox:      isSandbox,
      va_id:           activeVA.id,
      track_url:       `${appUrl}/resultado?order_id=${orderId}`,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error("[conduit/send]", err.message);
    return NextResponse.json({ error: err.message ?? "Error interno" }, { status: err.status ?? 500 });
  }
}
