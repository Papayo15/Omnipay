import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { parseCobrarV2Link, parseRemesaV2Link } from "@/lib/link";

// POST /api/pay/intent
//
// REGLA 1 — FX en tiempo real: el monto CAD se calcula aquí con la tasa Wise del segundo exacto.
//            El token solo guarda el monto en moneda destino (ej. 1,000 MXN). Nunca el CAD fijo.
//
// REGLA 2 — Wise solo se dispara desde el webhook stripe (payment_intent.succeeded).
//            Este endpoint es stateless: crea el PaymentIntent y retorna el clientSecret.
//
// REGLA 3 — Ciphertext unificado AES-256-GCM viaja en el metadata del PaymentIntent.
//            El webhook lo desencripta y tiene todo para ejecutar Wise + SMS.

// ── Fee structure: STANDARD vs INSTANT (NEXT_PUBLIC_PAYOUT_MODE) ─────────────
//
// cadAmount = (netCAD + SPEI_FLAT + STRIPE_FLAT) / (1 - OMNIPAY_PCT - stripeRate)
//
// Desglose visible al pagador:
//   wiseFee     = SPEI_FLAT
//   omniPayFee  = cadAmount × OMNIPAY_PCT
//   stripeFee   = cadAmount × stripeRate + STRIPE_FLAT
//   netCAD + wiseFee + omniPayFee + stripeFee = cadAmount  ✓
//
const SPEI_FLAT    = 0.50;   // buffer Wise SPEI (cubre variación por corredor)
const OMNIPAY_PCT  = 0.01;   // 1% OmniPay sobre el total cargado en Stripe
const STRIPE_FLAT  = 0.30;   // fee fijo Stripe por transacción
const STRIPE_BASE  = 0.035;  // 3.5% — cubre tarjetas internacionales y Amex
const STRIPE_INST  = 0.01;   // +1% Stripe Instant Payout — solo modo INSTANT

// ── Balance de Wise (kill switch de liquidez) ─────────────────────────────────
async function getWiseCADBalance(): Promise<number> {
  const apiKey    = process.env.WISE_API_KEY;
  const profileId = process.env.WISE_PROFILE_ID;
  if (!apiKey || !profileId) return Infinity; // sin credenciales → no bloquear
  try {
    const res = await fetch(
      `https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
    );
    if (!res.ok) return Infinity; // error de red → no bloquear
    const balances = await res.json() as Array<{ currency: string; amount: { value: number } }>;
    return balances.find((b) => b.currency === "CAD")?.amount.value ?? 0;
  } catch { return Infinity; }
}

// ── Tasa de cambio en vivo ────────────────────────────────────────────────────
async function getWiseLiveRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  if (process.env.WISE_API_KEY) {
    try {
      const res = await fetch(
        `https://api.wise.com/v1/rates?source=${from}&target=${to}`,
        { headers: { Authorization: `Bearer ${process.env.WISE_API_KEY}` }, cache: "no-store" },
      );
      if (res.ok) {
        const data = await res.json() as Array<{ rate: number }>;
        if (data[0]?.rate) return data[0].rate;
      }
    } catch {}
  }

  // Fallback: open exchange rates
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { rates: Record<string, number> };
      if (data.rates[to]) return data.rates[to];
    }
  } catch {}

  throw new Error(`Tasa de cambio no disponible: ${from}→${to}`);
}

// ── Metadata splitter (Stripe: max 500 chars por valor) ──────────────────────
function tokenToMeta(token: string, sig: string): Record<string, string> {
  const meta: Record<string, string> = { sig };
  if (token.length <= 490) {
    meta.t1 = token;
  } else {
    meta.t1 = token.slice(0, 490);
    meta.t2 = token.slice(490);
  }
  return meta;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { token: string; sig: string; type?: string };
    const { token, sig } = body;
    const type = body.type ?? "cobro";

    if (!token || !sig) {
      return NextResponse.json({ error: "Parámetros faltantes" }, { status: 400 });
    }

    const secret = process.env.LINK_SECRET ?? "dev-secret";
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

    // ── REMESA ────────────────────────────────────────────────────────────────
    if (type === "remesa") {
      const payload = await parseRemesaV2Link(token, sig, secret);
      if (!payload) {
        return NextResponse.json({ error: "Link inválido o expirado" }, { status: 401 });
      }

      // REGLA 1: tasa Wise en vivo — nunca el CAD guardado en el token
      const mode       = (process.env.NEXT_PUBLIC_PAYOUT_MODE ?? "STANDARD").toUpperCase();
      const stripeRate = mode === "INSTANT" ? STRIPE_BASE + STRIPE_INST : STRIPE_BASE;

      const wiseRate  = await getWiseLiveRate("CAD", payload.receiveCurrency);
      const netCAD    = payload.receiveAmount / wiseRate;
      // Fórmula circular resuelta: 1% OmniPay sobre el total que ve Stripe
      const cadAmount = (netCAD + SPEI_FLAT + STRIPE_FLAT) / (1 - OMNIPAY_PCT - stripeRate);

      // Desglose de tarifas para mostrar al pagador
      const omniPayFee = cadAmount * OMNIPAY_PCT;
      const stripeFee  = cadAmount * stripeRate + STRIPE_FLAT;
      const wiseFee    = SPEI_FLAT;

      // Kill switch: bloquear si el float Wise no alcanza para cubrir el envío
      const wiseCadBalance = await getWiseCADBalance();
      if (wiseCadBalance < netCAD + 50) {
        return NextResponse.json({ insufficient_liquidity: true }, { status: 412 });
      }

      const pi = await stripe.paymentIntents.create({
        amount:   Math.round(cadAmount * 100),
        currency: "cad",
        metadata: {
          type:             "remesa",
          recipient_name:   payload.recipientName.slice(0, 128),
          target_amount:    String(payload.receiveAmount),
          target_currency:  payload.receiveCurrency,
          target_country:   payload.targetCountry,
          cad_amount:       cadAmount.toFixed(2),
          net_cad:          netCAD.toFixed(2),
          wise_rate:        wiseRate.toFixed(6),
          payout_mode:      mode,
          ...tokenToMeta(token, sig),
        },
        automatic_payment_methods: { enabled: true },
      });

      return NextResponse.json({
        clientSecret: pi.client_secret,
        summary: {
          type:            "remesa",
          recipientName:   payload.recipientName,
          receiveAmount:   payload.receiveAmount,
          receiveCurrency: payload.receiveCurrency,
          cadAmount:       parseFloat(cadAmount.toFixed(2)),
          netCAD:          parseFloat(netCAD.toFixed(2)),
          wiseRate,
          targetCountry:   payload.targetCountry,
          payoutMode:      mode,
          stripeFeePct:    stripeRate,
          feeBreakdown: {
            wiseFee:    parseFloat(wiseFee.toFixed(2)),
            omniPayFee: parseFloat(omniPayFee.toFixed(2)),
            stripeFee:  parseFloat(stripeFee.toFixed(2)),
          },
        },
      });
    }

    // ── COBRO — cobra en la moneda nativa del comercio (ej. MXN) ─────────────
    const payload = await parseCobrarV2Link(token, sig, secret);
    if (!payload) {
      return NextResponse.json({ error: "Link inválido o expirado" }, { status: 401 });
    }

    const pi = await stripe.paymentIntents.create({
      amount:   Math.round(payload.amount * 100),
      currency: payload.currency.toLowerCase(),
      metadata: {
        type:           "cobro",
        recipient_name: payload.recipientName.slice(0, 128),
        amount:         String(payload.amount),
        currency:       payload.currency,
        ...tokenToMeta(token, sig),
      },
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
      clientSecret: pi.client_secret,
      summary: {
        type:          "cobro",
        recipientName: payload.recipientName,
        amount:        payload.amount,
        currency:      payload.currency,
        cadAmount:     payload.amount, // para compatibilidad con PaymentForm
      },
    });

  } catch (err) {
    console.error("pay/intent error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear el pago" },
      { status: 500 },
    );
  }
}
