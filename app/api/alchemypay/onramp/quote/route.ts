// POST /api/alchemypay/onramp/quote
//
// Estimate-only preview (fiat → crypto) before creating an on-ramp order.
// Used when the sender's country has no native pay-in rail on Bridge and
// pays in via Alchemy Pay instead.

import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/providers/alchemypay/quote";

export const runtime = "nodejs";

interface QuoteBody {
  fiatAmount:   number;
  fiatCurrency: string;
  crypto?:      string;   // default USDC
  network?:     string;   // default MATIC (Polygon) — must match Bridge's settlement chain
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: QuoteBody = await req.json();
    if (!body.fiatAmount || body.fiatAmount <= 0 || !body.fiatCurrency) {
      return NextResponse.json({ error: "fiatAmount and fiatCurrency are required" }, { status: 400 });
    }

    const quote = await getQuote({
      side:    "BUY",
      crypto:  body.crypto  ?? "USDC",
      network: body.network ?? "MATIC",
      fiat:    body.fiatCurrency,
      amount:  body.fiatAmount,
    });

    return NextResponse.json({ quote });
  } catch (err) {
    console.error("[alchemypay/onramp/quote] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote error" },
      { status: 500 },
    );
  }
}
