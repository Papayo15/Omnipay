import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Stripe Connect — Transfer a cuenta Express del receptor (zero float)
// El receptor crea su cuenta Stripe Express en 5 minutos
// Stripe maneja KYC, compliance, payouts locales (ACH, SEPA, SPEI, etc.)
//
// Requiere: Stripe Canada con Connect Platform aprobado

async function stripePost(path: string, body: Record<string, unknown>, secretKey: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe${path} error: ${err}`);
  }
  return res.json();
}

async function stripeGet(path: string, secretKey: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`Stripe GET ${path} failed`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const {
      amount, currency, connectedAccountId,
      receiverName, paymentIntentId,
    } = await req.json() as {
      amount: number; currency: string;
      connectedAccountId?: string;
      receiverName?: string;
      paymentIntentId?: string;
    };

    const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secretKey) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // If no connected account, create one and return onboarding URL
    if (!connectedAccountId) {
      const account = await stripePost("/accounts", {
        type: "express",
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_profile: { name: receiverName ?? "Receptor OmniPay" },
      }, secretKey) as { id: string };

      const link = await stripePost("/account_links", {
        account: account.id,
        refresh_url: `${appUrl}/resultado?s=error`,
        return_url:  `${appUrl}/resultado?s=success`,
        type: "account_onboarding",
      }, secretKey) as { url: string };

      return NextResponse.json({
        tx_id:        account.id,
        status:       "onboarding",
        onboarding_url: link.url,  // recipient opens this to register (5 min)
      });
    }

    // Transfer to existing connected account
    const netCents = Math.round(amount * 100);
    const transfer = await stripePost("/transfers", {
      amount:           netCents,
      currency:         currency.toLowerCase(),
      destination:      connectedAccountId,
      ...(paymentIntentId ? { source_transaction: paymentIntentId } : {}),
      description:      "OmniPay Transfer",
    }, secretKey) as { id: string; status?: string };

    // Trigger instant payout on the connected account if possible
    try {
      await stripePost("/payouts", {
        amount:   netCents,
        currency: currency.toLowerCase(),
        method:   "instant",
      }, `${secretKey}:${connectedAccountId}`); // Stripe-Account header workaround
    } catch { /* instant payout optional — standard payout will follow */ }

    return NextResponse.json({ tx_id: transfer.id, status: "pending" });
  } catch (err) {
    console.error("Stripe Connect error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connect error" },
      { status: 500 }
    );
  }
}
