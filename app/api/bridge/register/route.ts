// POST /api/bridge/register
//
// Called by /pagar when the sender opens a P2P payment link.
// - Decrypts the checkout token (validates authenticity)
// - Gets a live Wise quote (exact amount sender must deposit)
// - Saves {orderId → encrypted token} in Redis, TTL 24h
// - Returns: OmniPay's Wise receive account details + order_id
//
// Zero Bridge API calls — returns in ~300ms (one Wise quote call).
// No KYC, no sender data collected — just currency selection.

import { NextRequest, NextResponse } from "next/server";
import { decryptPayload }            from "@/lib/accountcrypto";
import { getRedis }                  from "@/lib/redis";

const OMNI_PCT  = 0.005;
const OMNI_MIN  = 1.99;
const OMNI_FLAT = 0.99;

// OmniPay Wise Business receive accounts — one fixed account per currency.
// Senders deposit here; Wise webhook fires automatically on credit.
// Values come from env vars set in Vercel (copy from Wise Business → each bucket → Account details).
const WISE_RECEIVE: Record<string, Record<string, string>> = {
  usd: {
    rail:             "ACH / Wire",
    bank_name:        process.env.WISE_USD_BANK_NAME  ?? "",
    routing_number:   process.env.WISE_USD_ROUTING    ?? "",
    account_number:   process.env.WISE_USD_ACCOUNT    ?? "",
    beneficiary_name: "OmniPay Inc.",
  },
  cad: {
    rail:               "EFT / Interac e-Transfer",
    institution_number: process.env.WISE_CAD_INSTITUTION ?? "",
    transit_number:     process.env.WISE_CAD_TRANSIT     ?? "",
    account_number:     process.env.WISE_CAD_ACCOUNT     ?? "",
    beneficiary_name:   "OmniPay Inc.",
    interac_email:      process.env.WISE_CAD_EMAIL       ?? "",
  },
  eur: {
    rail:           "SEPA",
    iban:           process.env.WISE_EUR_IBAN ?? "",
    bic:            process.env.WISE_EUR_BIC  ?? "TRWIBEB1XXX",
    account_holder: "OmniPay Inc.",
  },
  gbp: {
    rail:             "Faster Payments",
    sort_code:        process.env.WISE_GBP_SORT_CODE ?? "",
    account_number:   process.env.WISE_GBP_ACCOUNT   ?? "",
    beneficiary_name: "OmniPay Inc.",
  },
};

async function getWiseQuote(
  sourceCurrency: string,
  targetCurrency: string,
  targetAmount:   number,
): Promise<{ sourceAmount: number; rate: number } | null> {
  const profileId = process.env.WISE_PROFILE_ID ?? "";
  const apiKey    = process.env.WISE_API_KEY    ?? "";
  if (!profileId || !apiKey) return null;
  try {
    const res = await fetch(`https://api.wise.com/v3/profiles/${profileId}/quotes`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceCurrency: sourceCurrency.toUpperCase(),
        targetCurrency: targetCurrency.toUpperCase(),
        targetAmount,
      }),
    });
    if (!res.ok) return null;
    const q = await res.json() as { sourceAmount?: number; rate?: number };
    return q.sourceAmount ? { sourceAmount: q.sourceAmount, rate: q.rate ?? 0 } : null;
  } catch { return null; }
}

interface TokenMeta {
  nombre:           string;
  country:          string;
  target_currency:  string;
  amount_target:    number;
  receive_method:   string;
  liq_addr_id:      string;
  liq_addr_address: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: { token: string; sender_currency: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { token, sender_currency } = body;
  if (!token || !sender_currency) {
    return NextResponse.json({ error: "token y sender_currency son requeridos" }, { status: 400 });
  }

  const currency = sender_currency.toLowerCase();
  if (!WISE_RECEIVE[currency]) {
    return NextResponse.json(
      { error: `Moneda ${currency.toUpperCase()} no disponible. Usa: USD, CAD, EUR, GBP.` },
      { status: 400 },
    );
  }

  // Decrypt and validate checkout token
  let meta: TokenMeta;
  try {
    const decrypted = await decryptPayload(token);
    meta = JSON.parse(decrypted.account) as TokenMeta;
  } catch {
    return NextResponse.json({ error: "Token de pago inválido o alterado" }, { status: 400 });
  }

  if (!meta.liq_addr_id || !meta.amount_target) {
    return NextResponse.json(
      { error: "Token incompleto. El receptor debe generar un nuevo link." },
      { status: 400 },
    );
  }

  // Live Wise quote: how much sender must deposit in their currency to deliver meta.amount_target
  const quote = await getWiseQuote(currency, meta.target_currency, meta.amount_target);

  // Principal = amount Wise needs to receive (excluding OmniPay fee)
  // OmniPay fee is added on top so the recipient gets the full quoted amount
  const principal    = quote?.sourceAmount ?? 0;
  const omnipayFee   = parseFloat((Math.max(principal * OMNI_PCT, OMNI_MIN) + OMNI_FLAT).toFixed(2));
  const totalToSend  = parseFloat((principal + omnipayFee).toFixed(2));

  // Register order in Redis (TTL 24h) — stores encrypted token, not raw bank details
  const orderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const redis = await getRedis();
    // Key: p2p:order:{orderId}  Value: encrypted checkout token  TTL: 24h
    await redis.set(`p2p:order:${orderId}`, token, { EX: 86400 });
  } catch (e) {
    console.error("[register] Redis:", e);
    return NextResponse.json({ error: "Error al registrar la orden" }, { status: 500 });
  }

  return NextResponse.json({
    order_id:     orderId,
    wise_account: WISE_RECEIVE[currency],
    fee_breakdown: {
      principal:       parseFloat(principal.toFixed(2)),
      wise_fx:         "incluido en el tipo de cambio Wise",
      omnipay_service: parseFloat(Math.max(principal * OMNI_PCT, OMNI_MIN).toFixed(2)),
      omnipay_flat:    OMNI_FLAT,
      total_to_send:   totalToSend,
      currency:        currency.toUpperCase(),
      recipient_gets:  `${meta.amount_target.toLocaleString("es-MX")} ${meta.target_currency}`,
      rate_note:       quote ? `1 ${currency.toUpperCase()} = ${(meta.amount_target / principal).toFixed(4)} ${meta.target_currency} (Wise live)` : "Tipo de cambio en tiempo real de Wise",
    },
    recipient: {
      name:    meta.nombre,
      country: meta.country,
      method:  meta.receive_method,
    },
  });
}
