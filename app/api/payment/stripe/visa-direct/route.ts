import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Stripe Visa Direct OCT — Push instantáneo a tarjeta de débito del receptor
// Requiere: Stripe Canada + Visa Direct OCT aprobado por Stripe
// Solicitar en: dashboard.stripe.com → Settings → Payouts → Push payouts
//
// El receptor NO necesita registrarse — solo sus 16 dígitos de tarjeta Visa/MC
// El dinero llega en segundos a su tarjeta, en cualquier parte del mundo

async function stripeRequest(
  path: string,
  method: "POST" | "GET",
  secretKey: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": method === "POST" ? "application/json" : "text/plain",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe${path}: ${err}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const {
      amount, currency,
      recipientCardToken,   // Stripe token from frontend Stripe.js (NOT raw card number)
      paymentIntentId,
      receiverName,
    } = await req.json() as {
      amount: number; currency: string;
      recipientCardToken?: string;   // pm_xxx or tok_xxx from Stripe.js
      paymentIntentId?: string;
      receiverName?: string;
    };

    const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secretKey) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // If no card token yet, return a hosted URL for the recipient to enter their card
    // This maintains PCI compliance — card numbers never touch our servers
    if (!recipientCardToken) {
      // Create a SetupIntent for the recipient to register their debit card
      const setup = await stripeRequest("/setup_intents", "POST", secretKey, {
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          purpose:         "visa_direct_recipient",
          amount:          String(amount),
          currency,
          payment_intent:  paymentIntentId ?? "",
          receiver_name:   receiverName ?? "",
        },
      }) as { client_secret: string; id: string };

      return NextResponse.json({
        tx_id:            setup.id,
        status:           "awaiting_card",
        // Frontend uses this client_secret with Stripe.js to collect card
        client_secret:    setup.client_secret,
        register_url:     `${appUrl}/recibir?si=${setup.id}&cs=${setup.client_secret}`,
      });
    }

    // Push funds to recipient's tokenized card via Stripe Instant Payout
    const netCents = Math.round(amount * 100);

    // Attach the payment method to a temporary customer for payout
    const customer = await stripeRequest("/customers", "POST", secretKey, {
      name:           receiverName ?? "Receptor OmniPay",
      payment_method: recipientCardToken,
    }) as { id: string };

    // Create instant payout to the recipient's debit card
    const payout = await stripeRequest("/payouts", "POST", secretKey, {
      amount:      netCents,
      currency:    currency.toLowerCase(),
      method:      "instant",
      destination: recipientCardToken,
      description: "OmniPay Visa Direct",
      metadata: {
        receiver_name: receiverName ?? "",
        customer_id:   customer.id,
      },
    }) as { id: string; status: string; arrival_date?: number };

    return NextResponse.json({
      tx_id:          payout.id,
      status:         payout.status === "paid" ? "completed" : "pending",
      arrival_date:   payout.arrival_date,
    });
  } catch (err) {
    console.error("Visa Direct error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Visa Direct error" },
      { status: 500 }
    );
  }
}
