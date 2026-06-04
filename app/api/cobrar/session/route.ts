import { NextRequest, NextResponse } from "next/server";
import { buildCobrarLink } from "@/lib/link";

export const runtime = "edge";

// POST /api/cobrar/session
// Crea una Stripe Checkout Session con application_fee (1%).
// El dinero va directo de la tarjeta del cliente a la cuenta conectada del comercio.
// OmniPay NUNCA toca los fondos — solo recibe el 1% de application_fee automáticamente.

interface SessionRequest {
  amount: number;
  currency: string;
  merchantAccountId?: string;   // Stripe Express account ID (acct_xxx)
  merchantName?: string;
  merchantPhone?: string;
  clientPhone?: string;
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
    throw new Error(`Stripe ${path}: ${err}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const data: SessionRequest = await req.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }
    if (!data.amount || data.amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const currency = (data.currency || "mxn").toLowerCase();
    const amountCents = Math.round(data.amount * 100);
    const feeCents    = Math.round(amountCents * 0.01); // 1% OmniPay

    const successUrl = `${appUrl}/resultado?s=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${appUrl}/cobrar`;

    const params = new URLSearchParams({
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][product_data][name]": `Cobro OmniPay${data.merchantName ? ` — ${data.merchantName}` : ""}`,
      "line_items[0][quantity]": "1",
      mode: "payment",
      success_url: successUrl,
      cancel_url:  cancelUrl,
      "payment_intent_data[statement_descriptor]": "OMNIPAY",
      // metadata para el webhook (notificaciones SMS)
      ...(data.clientPhone   ? { "metadata[client_phone]":   data.clientPhone }   : {}),
      ...(data.merchantPhone ? { "metadata[merchant_phone]": data.merchantPhone } : {}),
      ...(data.merchantName  ? { "metadata[merchant_name]":  data.merchantName }  : {}),
    });

    // Si el comercio ya tiene cuenta Stripe Connect — dinero va directo a ellos
    if (data.merchantAccountId) {
      params.set("payment_intent_data[application_fee_amount]", String(feeCents));
      params.set("payment_intent_data[transfer_data][destination]", data.merchantAccountId);
    }

    const session = await stripePost("/checkout/sessions", params) as {
      id: string;
      url: string;
    };

    // Construir link firmado (5 min TTL) para compartir por WhatsApp/SMS
    // El link apunta al checkout_url de Stripe (no a /pagar)
    // Esto simplifica el flujo: el comercio comparte el link directo de Stripe
    const shareLink = await buildCobrarLink(
      {
        a:  data.amount,
        c:  data.currency,
        n:  data.merchantName ?? "Comercio",
        ph: data.merchantPhone ?? "",
        u:  session.url,
      },
      appUrl,
      process.env.LINK_SECRET ?? "dev-secret"
    );

    return NextResponse.json({
      session_id:   session.id,
      checkout_url: session.url,
      share_link:   shareLink,
    });
  } catch (err) {
    console.error("Cobrar session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment error" },
      { status: 500 }
    );
  }
}
