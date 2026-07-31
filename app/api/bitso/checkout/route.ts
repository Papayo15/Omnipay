// POST /api/bitso/checkout
//
// Canal 4: emisor en México genera una CLABE Bitso para recibir MXN via SPEI.
// Soporta dos modos:
//
// Modo TOKEN (desde /pagar o /b2b-bridge con currency=mxn):
//   Body: { token, sender_name, sender_email, sender_phone? }
//   Retorna: PayResponse-compatible { order_id, deposit_instructions, fee_breakdown, recipient, needs_kyc }
//
// Modo DIRECTO (B2B directo, legado):
//   Body: { nombre, email, country, account, amount_mxn, ... }
//   Retorna: { ok, order_id, clabe, bank_name, amount_mxn, concept, expires_at }
//
// Env vars requeridas:
//   BITSO_API_KEY, BITSO_API_SECRET, BITSO_API_BASE
//   REDIS_URL (para persistir el mapeo clabe→orderId entre instancias)
//   LINK_SECRET (para descifrar tokens en modo token)

import { NextRequest, NextResponse } from "next/server";
import { createClabe }               from "@/providers/bitso/clabes";
import { createOrder }               from "@/lib/order-state";
import { getRedis }                  from "@/lib/redis";
import { decryptPayload }            from "@/lib/accountcrypto";
import { nanoid }                    from "nanoid";

export const runtime = "nodejs";

// ── Modo TOKEN ────────────────────────────────────────────────────────────────

interface TokenBody {
  token:         string;
  sender_name:   string;
  sender_email:  string;
  sender_phone?: string;
}

// ── Modo DIRECTO ──────────────────────────────────────────────────────────────

interface DirectBody {
  nombre:          string;
  email:           string;
  country:         string;
  account:         string;
  bic?:            string;
  cpf?:            string;
  amount_mxn:      number;
  sender_phone?:   string;
  bank_name?:      string;
  sort_code?:      string;
  routing_number?: string;
  account_number?: string;
  bank_code?:      string;
}

// MXN service fee constants (same ratio as bridge-fees, expressed in MXN)
const OMNIPAY_SERVICE_PCT = 0.005;   // 0.50%
const OMNIPAY_FLAT_MXN    = 8.50;    // ≈ $0.49 USD at ~17 MXN/USD

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.BITSO_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "Canal Bitso no habilitado aún." }, { status: 503 });
  }

  let rawBody: Record<string, unknown>;
  try { rawBody = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Dispatch by mode
  if (typeof rawBody.token === "string") {
    return handleTokenMode(rawBody as unknown as TokenBody);
  }
  return handleDirectMode(rawBody as unknown as DirectBody);
}

// ── TOKEN MODE ────────────────────────────────────────────────────────────────

async function handleTokenMode(body: TokenBody): Promise<Response> {
  const { token, sender_name, sender_email, sender_phone } = body;

  if (!token || !sender_name || !sender_email) {
    return NextResponse.json(
      { error: "token, sender_name y sender_email son requeridos" },
      { status: 400 },
    );
  }

  // 1. Decrypt token → receptor metadata
  let meta: {
    liq_addr_id?:      string;
    liq_addr_address?: string;
    customer_id?:      string;
    nombre:            string;
    country:           string;
    target_currency:   string;
    amount_target:     number;
    receive_method?:   string;
    recipient_phone?:  string;
  };

  try {
    const decrypted = await decryptPayload(token);
    meta = JSON.parse(decrypted.account) as typeof meta;
  } catch {
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 400 });
  }

  if (!meta.nombre || !meta.country || !meta.amount_target) {
    return NextResponse.json({ error: "Token incompleto — el receptor debe generar un nuevo link" }, { status: 400 });
  }

  // 2. Convert amount_target → MXN
  const targetCurrency = (meta.target_currency ?? "USD").toUpperCase();
  let mxnRate = 1;

  if (targetCurrency !== "MXN") {
    try {
      const fxRes = await fetch(
        `https://open.er-api.com/v6/latest/${targetCurrency}`,
        { cache: "no-store" },
      );
      if (fxRes.ok) {
        const fxData = await fxRes.json() as { rates?: Record<string, number> };
        mxnRate = fxData.rates?.MXN ?? 1;
      }
    } catch { /* use 1:1 if FX lookup fails */ }
  }

  const amountPrincipalMxn = parseFloat((meta.amount_target * mxnRate).toFixed(2));
  const omnipayServiceMxn  = parseFloat((amountPrincipalMxn * OMNIPAY_SERVICE_PCT).toFixed(2));
  const omnipayFlatMxn     = OMNIPAY_FLAT_MXN;
  const totalToSendMxn     = parseFloat((amountPrincipalMxn + omnipayServiceMxn + omnipayFlatMxn).toFixed(2));

  // Minimum amount guard
  if (totalToSendMxn < 100) {
    return NextResponse.json({ error: "El monto mínimo de envío es MXN $100" }, { status: 400 });
  }

  const orderId   = `OP-BT-${nanoid(10).toUpperCase()}`;
  const reference = orderId.replace(/-/g, "").slice(0, 30);

  try {
    // 3. Crear CLABE Bitso dedicada
    const clabeData = await createClabe({ reference });
    const clabe     = clabeData.clabe;

    // 4. Persistir clabe → orderId en Redis (7 días TTL)
    try {
      const redis = await getRedis();
      await redis.set(`clabe-${clabe}`, orderId, { EX: 7 * 24 * 3600 });
    } catch (redisErr) {
      console.warn("[bitso/checkout] Redis set failed:", (redisErr as Error).message);
    }

    // 5. Crear orden — guardamos liq_addr y metadata en transferId para el webhook
    createOrder(orderId, {
      orderType:          "p2p",
      payInProvider:      "bitso-multi-clabe",
      payOutProvider:     meta.country.toUpperCase() === "MX" ? "bitso-direct" : "bridge",
      destinationCountry: meta.country.toUpperCase(),
      recipientName:      meta.nombre,
      recipientAccount:   meta.liq_addr_address ?? "",
      targetCurrency,
      amount:             totalToSendMxn,
      senderEmail:        sender_email.toLowerCase(),
      transferId:         JSON.stringify({
        liq_addr_id:     meta.liq_addr_id,
        liq_addr_addr:   meta.liq_addr_address,
        target_currency: targetCurrency,
        amount_target:   meta.amount_target,
        sender_phone,
      }),
    });

    // 6. Return PayResponse-compatible shape
    return NextResponse.json({
      order_id:  orderId,
      deposit_instructions: {
        rail:             "SPEI",
        currency:         "mxn",
        clabe,
        bank_name:        "Bitso (STP)",
        beneficiary_name: "OmniPay / Bitso",
        amount_to_deposit: totalToSendMxn.toFixed(2),
        instructions:     `Haz SPEI a la CLABE ${clabe} por MXN $${totalToSendMxn.toFixed(2)}. Concepto: ${orderId}`,
      },
      fee_breakdown: {
        amount_principal: amountPrincipalMxn,
        bridge_onramp:    0,
        bridge_offramp:   0,
        omnipay_service:  omnipayServiceMxn,
        omnipay_flat:     omnipayFlatMxn,
        kyc_surcharge:    0,
        kyb_surcharge:    0,
        is_new_customer:  false,
        total_to_send:    totalToSendMxn,
        recipient_gets:   `${meta.amount_target.toLocaleString("es-MX")} ${targetCurrency}`,
      },
      recipient: {
        name:    meta.nombre,
        country: meta.country.toUpperCase(),
        method:  meta.receive_method ?? "bank",
      },
      needs_kyc:  false,
      needs_kyb:  false,
      is_sandbox: false,
    });
  } catch (err) {
    const e = err as Error;
    console.error("[bitso/checkout/token]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── DIRECT MODE ───────────────────────────────────────────────────────────────

async function handleDirectMode(body: DirectBody): Promise<Response> {
  const { nombre, email, country, account, bic, cpf, amount_mxn, sender_phone,
          bank_name, sort_code, routing_number, account_number, bank_code } = body;

  if (!nombre || !email || !country || !account || !amount_mxn) {
    return NextResponse.json(
      { error: "nombre, email, country, account y amount_mxn son requeridos" },
      { status: 400 },
    );
  }
  if (amount_mxn < 100) {
    return NextResponse.json({ error: "El monto mínimo es MXN $100" }, { status: 400 });
  }

  const orderId   = `OP-BT-${nanoid(10).toUpperCase()}`;
  const reference = orderId.replace(/-/g, "").slice(0, 30);

  try {
    const clabeData = await createClabe({ reference });
    const clabe     = clabeData.clabe;

    try {
      const redis = await getRedis();
      await redis.set(`clabe-${clabe}`, orderId, { EX: 7 * 24 * 3600 });
    } catch (redisErr) {
      console.warn("[bitso/checkout] Redis set failed:", (redisErr as Error).message);
    }

    createOrder(orderId, {
      orderType:          "p2p",
      payInProvider:      "bitso-multi-clabe",
      payOutProvider:     country.toUpperCase() === "MX" ? "bitso-direct" : "bridge",
      destinationCountry: country.toUpperCase(),
      recipientName:      nombre,
      recipientAccount:   account,
      targetCurrency:     getCurrency(country.toUpperCase()),
      amount:             amount_mxn,
      senderEmail:        undefined,
      recipientEmail:     email.toLowerCase(),
      transferId:         JSON.stringify({
        account, bic, cpf, bank_name, sort_code,
        routing_number, account_number, bank_code,
        sender_phone,
      }),
    });

    return NextResponse.json({
      ok:          true,
      order_id:    orderId,
      clabe,
      bank_name:   "Bitso (STP)",
      beneficiary: "OmniPay / Bitso",
      amount_mxn,
      concept:     `OmniPay ${orderId}`,
      expires_at:  Date.now() + 7 * 24 * 3600 * 1000,
      instructions: `Haz SPEI a la CLABE ${clabe} por MXN $${amount_mxn.toFixed(2)}. ` +
                    `Concepto: OmniPay ${orderId}. El receptor recibirá el dinero en minutos.`,
    });
  } catch (err) {
    const e = err as Error;
    console.error("[bitso/checkout/direct]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getCurrency(country: string): string {
  const SEPA = new Set([
    "DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT","LU","MT","SK","SI","HR",
    "SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS","LI","AD","MC","SM","XK","VA",
  ]);
  if (country === "MX") return "MXN";
  if (country === "US") return "USD";
  if (country === "BR") return "BRL";
  if (country === "CO") return "COP";
  if (country === "GB") return "GBP";
  if (SEPA.has(country)) return "EUR";
  return "USD";
}
