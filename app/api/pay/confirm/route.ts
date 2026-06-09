import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// GET /api/pay/confirm?pi=pi_xxx
//
// Polling pasivo — solo consulta el estado del PaymentIntent en Stripe.
// REGLA 2: cero lógica Wise aquí. La transferencia Wise ocurre en el webhook
//          payment_intent.succeeded (servidor→servidor), nunca desde el cliente.

export async function GET(req: NextRequest) {
  const pi = new URL(req.url).searchParams.get("pi") ?? "";

  if (!pi.startsWith("pi_")) {
    return NextResponse.json({ error: "PaymentIntent ID inválido" }, { status: 400 });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
    const intent = await stripe.paymentIntents.retrieve(pi);

    return NextResponse.json({
      status:   intent.status,
      amount:   intent.amount / 100,
      currency: intent.currency.toUpperCase(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al verificar el pago" },
      { status: 500 },
    );
  }
}
