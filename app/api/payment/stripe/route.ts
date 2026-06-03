import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Stripe Checkout Session — Production
// Inbound: collects from sender via card / local method
// Outbound: Visa Direct (card) or Stripe Connect (bank account) — triggered by webhook

interface StripeCheckoutRequest {
  amount: number;
  currency: string;
  description: string;
  bankName?: string;
  recipientPhone?: string;
  auditUrl?: string;
  sourceCountry?: string;    // origin country → determines payment methods shown
  // Conciliation metadata (stored in session.metadata for webhook bridge):
  bankToken?: string;        // recipient card 16 digits or account number
  country?: string;          // recipient country code
  receiverName?: string;
  targetCurrency?: string;
  sourceCurrency?: string;
  outboundRail?: string;     // "visa_direct" | "stripe_connect" | "airwallex" | "stablecoin" | ""
}

// Dynamic payment methods by source country
function getPaymentMethods(currency: string, sourceCountry?: string): string[] {
  const base = ["card"];
  const src = (sourceCountry ?? "").toUpperCase();
  if (src === "MX" || currency === "mxn") return [...base, "oxxo"];
  if (src === "US") return [...base, "us_bank_account"];
  if (src === "BR") return [...base, "boleto", "pix"];
  if (src === "CO") return [...base, "pse"];
  const EU = ["DE","FR","ES","IT","NL","BE","AT","PT","IE","FI","GR","SK","SI","EE","LV","LT","LU","CY","MT"];
  if (EU.includes(src)) return [...base, "sepa_debit", "sofort"];
  return base;
}

async function stripePost(path: string, params: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe${path} failed: ${err}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const data: StripeCheckoutRequest = await req.json();
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const successUrl = `${appUrl}/resultado?s=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${appUrl}/resultado?s=error`;

    const amountCents = Math.round(data.amount * 100);
    const currency    = data.currency.toLowerCase();

    const params = new URLSearchParams({
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][product_data][name]": data.description || "Pago OmniPay",
      "line_items[0][price_data][product_data][description]":
        data.bankName ? `Para: ${data.bankName}` : "Terminal Virtual OmniPay",
      "line_items[0][quantity]": "1",
      mode: "payment",
      success_url: successUrl,
      cancel_url:  cancelUrl,
      // Notification metadata
      ...(data.recipientPhone ? { "metadata[recipient_phone]": data.recipientPhone } : {}),
      ...(data.auditUrl        ? { "metadata[audit_url]":       data.auditUrl }       : {}),
      // Conciliation metadata for webhook bridge
      ...(data.bankToken      ? { "metadata[bank_token]":       data.bankToken }      : {}),
      ...(data.country        ? { "metadata[country]":          data.country }        : {}),
      ...(data.bankName       ? { "metadata[bank_name]":        data.bankName }       : {}),
      ...(data.receiverName   ? { "metadata[receiver_name]":    data.receiverName }   : {}),
      ...(data.targetCurrency ? { "metadata[target_currency]":  data.targetCurrency } : {}),
      ...(data.sourceCurrency ? { "metadata[source_currency]":  data.sourceCurrency } : {}),
      ...(data.outboundRail   ? { "metadata[outbound_rail]":    data.outboundRail }   : {}),
    });

    // Dynamic payment methods based on source country
    const methods = getPaymentMethods(currency, data.sourceCountry);
    methods.forEach((m) => params.append("payment_method_types[]", m));

    const session = await stripePost("/checkout/sessions", params) as {
      id: string;
      url: string;
      payment_status: string;
    };

    return NextResponse.json({
      tx_id: session.id,
      checkout_url: session.url,
      status: "pending",
    });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}
