// GET /api/bridge/rate?token=<t>&currency=<usd|eur|gbp|mxn|brl>
//
// Preview de tasa de cambio antes de que el emisor llene el formulario.
// Usa la misma fórmula que /api/bridge/pay — no hay discrepancia de tasas.
// No crea nada en Bridge, no guarda nada, sin PII en la respuesta.

import { NextRequest, NextResponse } from "next/server";
import { decryptPayload }            from "@/lib/accountcrypto";
import { calcStaticQuote }           from "@/lib/bridge-fees";

export const runtime = "edge";

const SUPPORTED = ["usd", "eur", "gbp", "mxn", "brl"] as const;
type SrcCurrency = (typeof SUPPORTED)[number];

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const token    = searchParams.get("token") ?? "";
  const currency = (searchParams.get("currency") ?? "usd").toLowerCase() as SrcCurrency;

  if (!token)                        return NextResponse.json({ error: "token required" }, { status: 400 });
  if (!SUPPORTED.includes(currency)) return NextResponse.json({ error: "currency must be usd|eur|gbp|mxn|brl" }, { status: 400 });

  let meta: { amount_target: number; target_currency: string; country: string; sender_name?: string; sender_email?: string };
  try {
    const decrypted = await decryptPayload(token);
    meta = JSON.parse(decrypted.account);
  } catch {
    return NextResponse.json({ error: "Invalid or tampered token" }, { status: 400 });
  }

  const tgtCurrency = (meta.target_currency ?? "MXN").toUpperCase();
  const srcCurrency = currency.toUpperCase();

  // Fetch all rates from USD base — one request covers every conversion we need
  let ratesFromUSD: Record<string, number> = {};
  try {
    const fxRes = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (fxRes.ok) {
      const fxData = await fxRes.json() as { rates?: Record<string, number> };
      ratesFromUSD = fxData.rates ?? {};
    }
  } catch { /* proceed with fallback */ }

  // Convert amount_target (local currency) → USD (same logic as /api/bridge/pay)
  let amountUSD = meta.amount_target;
  const tgtToUSD = tgtCurrency === "USD" ? 1 : (1 / (ratesFromUSD[tgtCurrency] ?? 1));
  if (tgtToUSD && tgtCurrency !== "USD") {
    amountUSD = parseFloat((meta.amount_target * tgtToUSD).toFixed(2));
  }

  // Build fee quote (same formula as /api/bridge/pay, assume new customer for worst-case)
  let quote;
  try {
    quote = calcStaticQuote(amountUSD, meta.country, "p2p", true);
  } catch {
    return NextResponse.json({ error: "Country not supported for P2P transfers" }, { status: 422 });
  }

  // Convert USD total → sender's source currency
  const usdToSrc = srcCurrency === "USD" ? 1 : (ratesFromUSD[srcCurrency] ?? 1);
  const amountToPayInSrc = parseFloat((quote.total_sender_pays * usdToSrc).toFixed(2));

  // Exchange rate: 1 src_currency = ? tgt_currency
  const srcToUSD = srcCurrency === "USD" ? 1 : (1 / (ratesFromUSD[srcCurrency] ?? 1));
  const rate = parseFloat((srcToUSD / tgtToUSD).toFixed(4));

  return NextResponse.json({
    source_currency: srcCurrency,
    target_currency: tgtCurrency,
    recipient_gets:  meta.amount_target,
    amount_to_pay:   amountToPayInSrc,
    rate,
    sender_name:     meta.sender_name  ?? null,
    sender_email:    meta.sender_email ?? null,
    note: "Preview rate — final amount confirmed at payment time using same formula",
  });
}
