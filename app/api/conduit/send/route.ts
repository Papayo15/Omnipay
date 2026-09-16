// POST /api/conduit/send
//
// Conduit payment initiation — stateless VA + OFFRAMP Order pattern.
// OmniPay operates under KYC Reliance (platform approval) — no Persona link needed.
//
// Flow:
//   1. Find or create Conduit customer for the SENDER (by email, no KYC link)
//   2. Create Virtual Account on-demand (USD, returns deposit instructions)
//   3. Poll until VA is active (≤ 18 s)
//   4. Create OFFRAMP Order: VA → FX → recipient's bank
//   5. Return deposit instructions to client — stored in localStorage, NOT in DB

import { NextRequest, NextResponse }            from "next/server";
import { findOrCreateConduitCustomer }          from "@/lib/conduit/customers";
import { createConduitVA, waitForVAActivation } from "@/lib/conduit/virtual-accounts";
import { createOfframpOrder }                   from "@/lib/conduit/orders";
import { isConduitSandbox }                     from "@/lib/conduit/client";
import type { ConduitOfframpDestination }       from "@/lib/conduit/types";
import { calcStaticQuote }                      from "@/lib/bridge-fees";
import { getRate }                              from "@/lib/fx-server";
import { getTargetCurrency }                    from "@/lib/routing";

export const runtime = "nodejs"; // needs setTimeout for VA activation poll

interface SendBody {
  sender_name:       string;
  sender_email:      string;
  source_currency:   string;
  recipient_name:    string;
  recipient_country: string;
  // Recipient bank details (one of: clabe, iban+bic, routing+account, sort_code+account, pix_key)
  clabe?:            string;
  iban?:             string;
  bic?:              string;
  pix_key?:          string;
  routing_number?:   string;
  account_number?:   string;
  sort_code?:        string;   // UK only — separate from account_number
  amount_target:     number;
}

// Maps country code → Conduit offramp rail + target currency
const RAIL_MAP: Record<string, { rail: string; currency: string }> = {
  MX: { rail: "spei",          currency: "MXN" },
  US: { rail: "ach",           currency: "USD" },
  BR: { rail: "pix",           currency: "BRL" },
  CO: { rail: "local",         currency: "COP" },
  GB: { rail: "fps",           currency: "GBP" },
  // SEPA zone — add countries as needed
  DE: { rail: "sepa",          currency: "EUR" },
  FR: { rail: "sepa",          currency: "EUR" },
  ES: { rail: "sepa",          currency: "EUR" },
  IT: { rail: "sepa",          currency: "EUR" },
  NL: { rail: "sepa",          currency: "EUR" },
  PT: { rail: "sepa",          currency: "EUR" },
};

function buildDestination(body: SendBody, country: string): ConduitOfframpDestination {
  const railInfo = RAIL_MAP[country];
  if (!railInfo) throw new Error(`País ${country} no soportado en Conduit`);

  const base: ConduitOfframpDestination = {
    type:               "bank_account",
    rail:               railInfo.rail,
    currency:           railInfo.currency,
    beneficiaryName:    body.recipient_name,
    beneficiaryCountry: country,
  };

  if (railInfo.rail === "spei")  return { ...base, clabe: body.clabe };
  if (railInfo.rail === "pix")   return { ...base, pixKey: body.pix_key };
  if (railInfo.rail === "fps")   return { ...base, sortCode: body.sort_code, accountNumber: body.account_number };
  if (railInfo.rail === "sepa")  return { ...base, iban: body.iban, bic: body.bic };
  // ach / local / fedwire
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

    // 1. Find or create Conduit customer (no KYC gate — OmniPay has platform approval)
    const [firstName, ...rest] = sender_name.split(" ");
    const customer = await findOrCreateConduitCustomer(
      sender_email.toLowerCase(),
      firstName,
      rest.join(" ") || "-",
    );

    // 2. Create VA on-demand — returned to client, stored in localStorage (stateless)
    const va = await createConduitVA(customer.id, "USD");

    // 3. Poll until VA is active (up to ~18 s)
    const activeVA = await waitForVAActivation(customer.id, va.id);

    // 4. Build fee quote (reuse existing OmniPay engine)
    let quote;
    try {
      quote = calcStaticQuote(amountUSD, country, "p2p", true);
    } catch {
      return NextResponse.json({ error: "Country not supported" }, { status: 422 });
    }

    // 5. Build OFFRAMP destination from recipient bank details
    const destination = buildDestination(body, country);

    // 6. Create OFFRAMP Order — OPC- prefix identifies Conduit orders in webhooks
    const orderId = `OPC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createOfframpOrder({
      customerId:        customer.id,
      sourceVaId:        activeVA.id,
      amount:            quote.total_sender_pays,
      destination,
      externalReference: orderId,
    });

    // 7. Convert deposit amount to source currency for display
    const usdToSource = source_currency.toLowerCase() === "usd"
      ? 1
      : (await getRate("USD", source_currency.toUpperCase()).catch(() => null)) ?? 1;
    const depositAmountInSource = parseFloat((quote.total_sender_pays * usdToSource).toFixed(2));

    // Build deposit instructions from active VA
    const di = activeVA.depositInstructions;
    const usDomestic = di.find(i => i.type === "us_domestic");
    const sepa       = di.find(i => i.type === "sepa");
    const swift      = di.find(i => i.type === "swift");
    const ukDomestic = di.find(i => i.type === "uk_domestic");

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
        // US domestic (ACH / Wire)
        routing_number:    usDomestic?.routingNumber,
        account_number:    usDomestic?.accountNumber,
        beneficiary_name:  usDomestic?.beneficiaryName ?? swift?.beneficiaryName,
        // SEPA / SWIFT
        iban:              sepa?.iban ?? swift?.iban,
        bic:               sepa?.bic  ?? swift?.bic,
        // UK domestic
        sort_code:         ukDomestic?.sortCode,
        // Payment reference (required for some VA types)
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
        rail:    RAIL_MAP[country].rail,
      },
      target_currency: targetCurrency,
      amount_target,
      is_sandbox:      isSandbox,
      va_id:           activeVA.id,
      customer_id:     customer.id,
      track_url:       `${appUrl}/resultado?order_id=${orderId}`,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error("[conduit/send]", err.message);
    return NextResponse.json({ error: err.message ?? "Error interno" }, { status: err.status ?? 500 });
  }
}
