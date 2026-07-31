// POST /api/bitso/checkout
//
// Canal 4: emisor en México genera una CLABE Bitso para recibir MXN via SPEI.
// El emisor hace SPEI a esa CLABE desde su banco mexicano.
// Cuando llega el depósito, el webhook /api/bitso/webhook dispara el payout al receptor.
//
// Body: { nombre, email, country, account, bic?, cpf?, amount_mxn, sender_phone? }
// Respuesta: { clabe, bank_name, amount_mxn, order_id, expires_at }
//
// Env vars requeridas:
//   BITSO_API_KEY, BITSO_API_SECRET, BITSO_API_BASE
//   REDIS_URL (para persistir el mapeo clabe→orderId entre instancias)

import { NextRequest, NextResponse } from "next/server";
import { createClabe }               from "@/providers/bitso/clabes";
import { createOrder }               from "@/lib/order-state";
import { getRedis }                  from "@/lib/redis";
import { nanoid }                    from "nanoid";

export const runtime = "nodejs";

interface CheckoutBody {
  nombre:          string;    // nombre del receptor (en el extranjero)
  email:           string;    // email del receptor
  country:         string;    // país destino del receptor (ISO-2, ej: US, DE, BR)
  account:         string;    // cuenta destino: IBAN / routing+account / sort_code / PIX key
  bic?:            string;    // BIC requerido para SEPA
  cpf?:            string;    // CPF/CNPJ requerido para PIX Brasil
  amount_mxn:      number;    // monto en MXN que el emisor va a enviar
  sender_phone?:   string;    // teléfono del emisor MX (para notificaciones)
  bank_name?:      string;
  sort_code?:      string;
  routing_number?: string;
  account_number?: string;
  bank_code?:      string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.BITSO_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "Canal Bitso no habilitado aún." }, { status: 503 });
  }

  let body: CheckoutBody;
  try { body = await req.json() as CheckoutBody; }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

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
    // 1. Crear CLABE Bitso dedicada para esta orden
    const clabeData = await createClabe({ reference });
    const clabe     = clabeData.clabe;

    // 2. Persistir mapeo clabe → orderId en Redis (7 días TTL)
    try {
      const redis = await getRedis();
      await redis.set(`clabe-${clabe}`, orderId, { EX: 7 * 24 * 3600 });
    } catch (redisErr) {
      console.warn("[bitso/checkout] Redis set failed:", (redisErr as Error).message);
    }

    // 3. Crear orden en el state machine
    createOrder(orderId, {
      orderType:          "p2p",
      payInProvider:      "bitso-multi-clabe",
      payOutProvider:     country === "MX" ? "bitso-direct" : "bridge",
      destinationCountry: country.toUpperCase(),
      recipientName:      nombre,
      recipientAccount:   account,   // será enmascarado en Redis por createOrder
      targetCurrency:     getCurrency(country.toUpperCase()),
      amount:             amount_mxn,
      senderEmail:        undefined,
      recipientEmail:     email.toLowerCase(),
      // Guardamos metadata extra en transferId temporalmente para el webhook
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
    console.error("[bitso/checkout]", e.message);
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
