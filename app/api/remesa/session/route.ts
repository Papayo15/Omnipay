import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { buildRemesaLink } from "@/lib/link";

// POST /api/remesa/session
// Crea un Stripe Checkout session para cobrar al emisor y construye el link HMAC
// firmado con el stripeSessionId embebido. El receptor usa el link para recibir.

interface RemesaSessionRequest {
  amount: number;
  currency: string;
  targetCountry: string;
  targetCurrency: string;
  targetAmount: number;
  senderPhone: string;
  senderName?: string;
  recipientPhone: string;
  recipientName?: string;
}

export async function POST(req: NextRequest) {
  try {
    const data: RemesaSessionRequest = await req.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const secret = process.env.LINK_SECRET ?? "dev-secret";

    if (!data.amount || data.amount <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }
    if (!data.recipientPhone && !data.recipientName) {
      return NextResponse.json({ error: "Datos del receptor requeridos" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

    const amountCents = Math.round(data.amount * 100);
    const feeCents   = Math.round(amountCents * 0.01);

    const session = await stripe.checkout.sessions.create({
      mode:           "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency:     data.currency.toLowerCase(),
          unit_amount:  amountCents,
          product_data: {
            name: `Remesa OmniPay → ${data.targetCountry}`,
            description: `${data.targetAmount} ${data.targetCurrency} para ${data.recipientName ?? data.recipientPhone}`,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: feeCents,
      },
      success_url: `${appUrl}/remesa?paid=1`,
      cancel_url:  `${appUrl}/remesa`,
      metadata: {
        remesaType:     "outbound",
        senderPhone:    data.senderPhone,
        senderName:     data.senderName ?? "",
        recipientPhone: data.recipientPhone,
        recipientName:  data.recipientName ?? "",
        targetCountry:  data.targetCountry,
        targetCurrency: data.targetCurrency,
        targetAmount:   String(data.targetAmount),
      },
    });

    const shareLink = await buildRemesaLink(
      {
        amount:          data.amount,
        currency:        data.currency,
        targetCountry:   data.targetCountry,
        targetCurrency:  data.targetCurrency,
        targetAmount:    data.targetAmount,
        senderPhone:     data.senderPhone,
        senderName:      data.senderName,
        recipientPhone:  data.recipientPhone,
        recipientName:   data.recipientName,
        stripeSessionId: session.id,
      },
      appUrl,
      secret
    );

    return NextResponse.json({ checkout_url: session.url, share_link: shareLink });
  } catch (err) {
    console.error("Remesa session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar link" },
      { status: 500 }
    );
  }
}
