// POST /api/whatsapp/webhook — Meta WhatsApp Cloud API bot
// GET  /api/whatsapp/webhook — Meta webhook verification (challenge echo)
//
// Costo: $0 — conversaciones donde el usuario escribe primero son gratuitas (ventana 24h)
// Sin Twilio — solo fetch() a la Graph API de Meta
//
// Regla de Oro: CERO PII almacenado
// Redis key: wa:session:{sha256(waId)} → { step, amount?, currency? }
// El número de teléfono del usuario se hashea con SHA-256 — jamás se guarda el número real
//
// Env vars necesarias en Vercel:
//   WHATSAPP_ACCESS_TOKEN    → Meta Business → App → WhatsApp → Generate token
//   WHATSAPP_PHONE_NUMBER_ID → ID del número en Meta Developer Console
//   WHATSAPP_VERIFY_TOKEN    → token que tú eliges (ej: "omnipay_verify_2024")

import { NextRequest, NextResponse } from "next/server";
import { getRedis }                  from "@/lib/redis";
import { createHash }                from "crypto";

export const runtime = "nodejs";

const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay-jade.vercel.app";
const TOKEN_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN_AT = process.env.WHATSAPP_ACCESS_TOKEN;

// ── Session TTL: 5 min — long enough for 2-step conversation ─────────────────
const SESSION_TTL = 5 * 60; // seconds

interface WaSession {
  step:      1 | 2;
  amount?:   number;
  currency?: string;
  country?:  string;
}

function hashPhone(waId: string): string {
  return createHash("sha256").update(waId).digest("hex").slice(0, 32);
}

async function getSession(waId: string): Promise<WaSession | null> {
  try {
    const redis = await getRedis();
    const raw = await redis.get(`wa:session:${hashPhone(waId)}`);
    return raw ? JSON.parse(raw) as WaSession : null;
  } catch { return null; }
}

async function setSession(waId: string, session: WaSession): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(
      `wa:session:${hashPhone(waId)}`,
      JSON.stringify(session),
      { EX: SESSION_TTL },
    );
  } catch { /* non-critical */ }
}

async function clearSession(waId: string): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.del(`wa:session:${hashPhone(waId)}`);
  } catch { /* non-critical */ }
}

// ── Meta Graph API — send WhatsApp text message ──────────────────────────────
async function sendMessage(to: string, body: string): Promise<void> {
  if (!TOKEN_ID || !TOKEN_AT) {
    console.warn("[wa/webhook] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set");
    return;
  }
  await fetch(`https://graph.facebook.com/v20.0/${TOKEN_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN_AT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body },
    }),
  }).catch(e => console.error("[wa/webhook] sendMessage error:", (e as Error).message));
}

// ── Parse incoming message text ───────────────────────────────────────────────

// Supported country aliases → ISO code
const COUNTRY_ALIASES: Record<string, string> = {
  mexico: "MX", méxico: "MX", mx: "MX",
  usa: "US", "estados unidos": "US", "united states": "US", us: "US", eeuu: "US",
  brasil: "BR", brazil: "BR", br: "BR",
  colombia: "CO", co: "CO",
  uk: "GB", "reino unido": "GB", "united kingdom": "GB", gb: "GB", england: "GB",
  alemania: "DE", germany: "DE", de: "DE",
  españa: "ES", espana: "ES", spain: "ES", es: "ES",
  francia: "FR", france: "FR", fr: "FR",
  italia: "IT", italy: "IT", it: "IT",
  portugal: "PT", pt: "PT",
  canada: "CA", canadá: "CA", ca: "CA",
};

// Supported currencies
const CURRENCY_ALIASES: Record<string, string> = {
  usd: "USD", dólares: "USD", dollars: "USD", dollar: "USD", dolar: "USD",
  cad: "CAD", "dólares canadienses": "CAD",
  eur: "EUR", euros: "EUR", euro: "EUR",
  gbp: "GBP", pounds: "GBP", libras: "GBP",
  mxn: "MXN", pesos: "MXN", peso: "MXN",
};

function parseAmount(text: string): { amount: number; currency: string; country: string } | null {
  const t = text.toLowerCase().trim();

  // Try to extract amount (number with optional decimals)
  const numMatch = t.match(/\b(\d{1,6}(?:[.,]\d{1,2})?)\b/);
  if (!numMatch) return null;
  const amount = parseFloat(numMatch[1].replace(",", "."));
  if (isNaN(amount) || amount <= 0) return null;

  // Try to find currency
  let currency = "USD";
  for (const [alias, code] of Object.entries(CURRENCY_ALIASES)) {
    if (t.includes(alias)) { currency = code; break; }
  }

  // Try to find country
  let country = "MX"; // default
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
    if (t.includes(alias)) { country = code; break; }
  }

  return { amount, currency, country };
}

// ── GET — Meta webhook verification ──────────────────────────────────────────
export function GET(req: NextRequest): Response {
  const verifyToken  = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode         = req.nextUrl.searchParams.get("hub.mode");
  const token        = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge    = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — incoming WhatsApp messages ────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Meta sends a "statuses" array for delivery receipts — ignore those
  const entry = (body.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
  if (!entry) return NextResponse.json({ ok: true });

  const changes = (entry.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
  const value   = changes?.value as Record<string, unknown> | undefined;
  const messages = value?.messages as unknown[] | undefined;

  if (!messages?.length) return NextResponse.json({ ok: true });

  const msg    = messages[0] as Record<string, unknown>;
  const waId   = String((msg.from as string) ?? "");
  const msgType = String((msg.type as string) ?? "");

  // Only handle text messages
  if (msgType !== "text") return NextResponse.json({ ok: true });

  const text = String(((msg.text as Record<string,string>)?.body ?? "")).trim();
  if (!text || !waId) return NextResponse.json({ ok: true });

  const session = await getSession(waId);

  // ── Step 1: any message → ask for amount + country ───────────────────────
  if (!session || session.step === 1) {
    await setSession(waId, { step: 1 });
    await sendMessage(waId,
      `👋 ¡Hola! Soy el asistente de OmniPay.\n\n` +
      `¿Cuánto quieres enviar y a qué país?\n\n` +
      `Escríbeme algo como:\n` +
      `• *200 USD México*\n` +
      `• *500 CAD Colombia*\n` +
      `• *1000 EUR España*\n\n` +
      `_(Este chat expira en 5 minutos por seguridad)_`
    );
    // If this IS already an amount (user wrote amount on first try), process it
    const parsed = parseAmount(text);
    if (parsed) {
      await setSession(waId, { step: 2 });
      const url = `${APP_URL}/p2p?amount=${parsed.amount}&currency=${parsed.currency}&country=${parsed.country}`;
      await sendMessage(waId,
        `✅ Listo. Tu cotización para *${parsed.amount} ${parsed.currency} → ${parsed.country}*:\n\n` +
        `🔗 ${url}\n\n` +
        `Abre el link para ver el desglose exacto de fees y proceder con el envío.\n\n` +
        `_OmniPay no guarda ninguno de tus datos._`
      );
      await clearSession(waId);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Step 2: parse amount + country → generate URL ────────────────────────
  const parsed = parseAmount(text);
  if (!parsed) {
    await sendMessage(waId,
      `Hmm, no entendí bien 🤔\n\nEscríbeme el monto y país así:\n*200 USD México*`
    );
    return NextResponse.json({ ok: true });
  }

  const { amount, currency, country } = parsed;
  const url = `${APP_URL}/p2p?amount=${amount}&currency=${currency}&country=${country}`;

  await sendMessage(waId,
    `✅ Listo. Tu cotización para *${amount} ${currency} → ${country}*:\n\n` +
    `🔗 ${url}\n\n` +
    `Abre el link para ver el desglose de fees y proceder con el envío.\n\n` +
    `_OmniPay no guarda ninguno de tus datos. Tu privacidad es nuestra regla #1._`
  );

  await clearSession(waId);
  return NextResponse.json({ ok: true });
}
