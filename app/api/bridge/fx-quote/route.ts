// GET /api/bridge/fx-quote?from=USD&to=MXN&amount=3459&country=MX
//
// Preview de cuánto deposita el emisor en su moneda de origen para que el receptor
// reciba el monto indicado en moneda destino. No requiere token ni autenticación.
// `from` = moneda que deposita el emisor (USD, EUR, GBP)
// `to`   = moneda que recibe el receptor (MXN, BRL, COP, EUR, GBP, USD)
// `amount` = monto en moneda del receptor

import { NextRequest, NextResponse } from "next/server";
import { calcStaticQuote } from "@/lib/bridge-fees";

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

  // Fetch all rates in one call (USD base, gratuito, sin API key)
  let ratesFromUSD: Record<string, number> = {};
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const data = await res.json() as { rates?: Record<string, number> };
      ratesFromUSD = data.rates ?? {};
    }
  } catch { /* proceed without rates */ }

  // 1 FROM = ? TO
  // from → USD → to
  const fromToUSD = from === "USD" ? 1 : (1 / (ratesFromUSD[from] ?? 1));
  const usdToTo   = to   === "USD" ? 1 : (ratesFromUSD[to] ?? null);
  if (!usdToTo) {
    return NextResponse.json({ error: "FX rate unavailable for " + to }, { status: 503 });
  }
  const fromToTo = parseFloat((fromToUSD * usdToTo).toFixed(4)); // 1 FROM = X TO

  // Convert target amount (TO currency) → USD principal (Bridge fee engine works in USD)
  const amountUSD = parseFloat((amount / usdToTo).toFixed(2));

  // Build fee quote using existing engine (operates in USD)
  let quote;
  try {
    quote = calcStaticQuote(amountUSD, country, "p2p", true);
  } catch {
    return NextResponse.json({ error: "Country not supported" }, { status: 422 });
  }

  const bridgeFeeUSD  = parseFloat(((quote.bridge_onramp ?? 0) + (quote.bridge_offramp ?? 0)).toFixed(2));
  const omnipayFeeUSD = parseFloat(quote.omnipay_net_revenue.toFixed(2));
  const totalUSD      = quote.total_sender_pays;

  // Convert USD totals → source currency (FROM)
  const usdToFrom = from === "USD" ? 1 : (ratesFromUSD[from] ?? 1);
  const toFrom = (n: number) => parseFloat((n * usdToFrom).toFixed(2));

  return NextResponse.json({
    from_currency:        from,
    target_currency:      to,
    fx_rate:              fromToTo,        // 1 FROM = X TO
    recipient_gets:       amount,
    bridge_fee:           toFrom(bridgeFeeUSD),
    omnipay_fee:          toFrom(omnipayFeeUSD),
    total_fee:            toFrom(bridgeFeeUSD + omnipayFeeUSD),
    sender_deposits:      toFrom(totalUSD), // in FROM currency
    note: "Estimate — final rate locked at deposit time by Bridge",
  });
}
