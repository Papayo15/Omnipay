// POST /api/bridge/quote
//
// Opción A: dynamic KYC check via Bridge before building the quote.
// Bridge is our "database" — GET /customers?email=x tells us if KYC is done.
//
// Body: { amount: number, email: string, type: "p2p" | "b2b" }
// Returns: full FeeQuote with line-by-line breakdown visible to the sender.

import { NextRequest, NextResponse } from "next/server";
import { buildDynamicQuote }         from "@/lib/bridge-fees";
import { getTargetCurrency }         from "@/lib/routing";

export const runtime = "edge";

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const amount  = Number(body.amount  ?? 0);
  const email   = String(body.email   ?? "").trim().toLowerCase();
  const type    = String(body.type    ?? "p2p") as "p2p" | "b2b";
  const country = String(body.country ?? "MX").toUpperCase();

  if (!amount || amount <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  if (!email)                 return NextResponse.json({ error: "email is required"  }, { status: 400 });

  let quote;
  try {
    quote = await buildDynamicQuote({ amount, country, email, type });
  } catch (e) {
    console.error("[bridge/quote]", e);
    return NextResponse.json({ error: "Failed to build quote" }, { status: 500 });
  }

  const targetCurrency = getTargetCurrency(country);
  const bridgeFeeTotal = (quote.bridge_onramp ?? 0) + (quote.bridge_offramp ?? 0);

  return NextResponse.json({
    ...quote,
    country,
    target_currency: targetCurrency,
    rate_note:       "Exchange rate provided by Bridge · Subject to change at settlement",
    summary: {
      you_send:      `$${quote.total_sender_pays.toFixed(2)} USD`,
      provider_fee:  quote.provider === "paysend"
        ? `$${(quote.paysend_cost ?? 0).toFixed(2)} USD (Paysend)`
        : `$${bridgeFeeTotal.toFixed(2)} USD (0.75% Bridge)`,
      omnipay_fee:   `$${(quote.omnipay_service + quote.omnipay_flat).toFixed(2)} USD`,
      kyc_note:      quote.is_new_customer
        ? `$${quote.kyc_surcharge.toFixed(2)} one-time identity verification (required by regulation)`
        : null,
      omnipay_earns: `$${quote.omnipay_net_revenue.toFixed(2)} USD per transaction`,
    },
  });
}
