// GET /api/conduit/fx-quote?from=USD&to=MXN&amount=3459&country=MX
// Same contract as /api/bridge/fx-quote — reuses the same FX engine and fee constants.
// Conduit's fee structure mirrors OmniPay's existing model.

import { NextRequest, NextResponse } from "next/server";
import { calcStaticQuote, calculatePayout } from "@/lib/bridge-fees";
import { fetchRatesFrom } from "@/lib/fx-server";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const from    = (searchParams.get("from")    ?? "USD").toUpperCase();
  const to      = (searchParams.get("to")      ?? "MXN").toUpperCase();
  const country = (searchParams.get("country") ?? "MX").toUpperCase();
  const amount  = parseFloat(searchParams.get("amount") ?? "0");

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }

  const ratesFromUSD = await fetchRatesFrom("USD");

  const fromToUSD = from === "USD" ? 1 : (1 / (ratesFromUSD[from] ?? 1));
  const usdToTo   = to   === "USD" ? 1 : (ratesFromUSD[to] ?? null);
  if (!usdToTo) {
    return NextResponse.json({ error: "FX rate unavailable for " + to }, { status: 503 });
  }
  const fromToTo = parseFloat((fromToUSD * usdToTo).toFixed(4));

  const amountUSD = parseFloat((amount / usdToTo).toFixed(2));

  let quote;
  try {
    quote = calcStaticQuote(amountUSD, country, "p2p", true);
  } catch {
    return NextResponse.json({ error: "Country not supported" }, { status: 422 });
  }

  const bridgeFeeUSD  = parseFloat(((quote.bridge_onramp ?? 0) + (quote.bridge_offramp ?? 0)).toFixed(2));
  const omnipayFeeUSD = parseFloat(quote.omnipay_net_revenue.toFixed(2));
  const totalUSD      = quote.total_sender_pays;

  const usdToFrom = from === "USD" ? 1 : (ratesFromUSD[from] ?? 1);
  const toFrom = (n: number) => parseFloat((n * usdToFrom).toFixed(2));

  const speiBreakdown = from === "MXN"
    ? (() => {
        const amountMxn    = parseFloat((amountUSD * usdToFrom).toFixed(2));
        const bridgeFxRate = parseFloat((fromToUSD).toFixed(6));
        return calculatePayout(amountMxn, bridgeFxRate) ?? undefined;
      })()
    : undefined;

  return NextResponse.json({
    provider:        "conduit",
    from_currency:   from,
    target_currency: to,
    fx_rate:         fromToTo,
    recipient_gets:  amount,
    bridge_fee:      toFrom(bridgeFeeUSD),
    omnipay_fee:     toFrom(omnipayFeeUSD),
    total_fee:       toFrom(bridgeFeeUSD + omnipayFeeUSD),
    sender_deposits: toFrom(totalUSD),
    ...(speiBreakdown ? { spei_breakdown: speiBreakdown } : {}),
    note: "Estimate — final rate locked at deposit time by Conduit",
  });
}
