import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// POST /api/cobrar/onboard
// Crea o recupera una Stripe Express Account para el comercio.
// Solo se hace una vez. El comercio completa el KYC en Stripe (~5 min).
// OmniPay no almacena ningún dato del comercio.

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
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const { email, country } = await req.json() as { email?: string; country?: string };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Crear Express Account
    const accountParams = new URLSearchParams({
      type: "express",
      ...(country ? { country } : { country: "CA" }), // default Canadá
      ...(email ? { email } : {}),
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
    });
    const account = await stripePost("/accounts", accountParams) as { id: string };

    // Generar link de onboarding
    const linkParams = new URLSearchParams({
      account:     account.id,
      refresh_url: `${appUrl}/cobrar?onboard=retry`,
      return_url:  `${appUrl}/cobrar?onboard=done&account=${account.id}`,
      type:        "account_onboarding",
    });
    const link = await stripePost("/account_links", linkParams) as { url: string };

    return NextResponse.json({
      account_id:    account.id,
      onboarding_url: link.url,
    });
  } catch (err) {
    console.error("Onboard error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Onboard error" },
      { status: 500 }
    );
  }
}
