// POST /api/quote
//
// Thin wrapper that proxies to /api/bridge/quote.
// Kept for backward compatibility with existing frontend calls.
// New integrations should call /api/bridge/quote directly.

import { NextRequest, NextResponse } from "next/server";
import { buildDynamicQuote, calcStaticQuote } from "@/lib/bridge-fees";
import { getTargetCurrency }                  from "@/lib/routing";

export const runtime = "edge";

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const amount  = Number(body.usdc_amount ?? body.amount ?? 0);
  const country = String(body.destination_country ?? body.country ?? "MX").toUpperCase();
  const email   = String(body.email ?? "").trim().toLowerCase();
  const type    = String(body.type ?? "p2p") as "p2p" | "b2b";

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount or usdc_amount must be > 0" }, { status: 400 });
  }

  const quote = email
    ? await buildDynamicQuote({ amount, country, email, type })
    : calcStaticQuote(amount, country, type);

  return NextResponse.json({
    ...quote,
    destination_country: country,
    target_currency:     getTargetCurrency(country),
    payin_provider:      "bridge",
    payout_provider:     "bridge",
    calculated_at:       new Date().toISOString(),
  });
}
