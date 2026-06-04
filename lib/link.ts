// OmniPay Link Engine — HMAC-SHA256 + Base64URL
// Tres tipos de tokens: cobro, remesa, comprobante
// TTL único: 10 minutos. Un solo uso (el proveedor downstream garantiza idempotencia).
// Stateless: el link ES el estado. Sin base de datos.

const TTL_MS = 10 * 60 * 1000; // 10 minutos — igual para cobro y remesa

// ── Helpers privados ──────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlEncode(str: string): string {
  const buf = new TextEncoder().encode(str);
  return base64url(buf.buffer as ArrayBuffer);
}

function base64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return Uint8Array.from(atob(b + pad), (c) => c.charCodeAt(0));
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return base64url(sig);
}

async function hmacVerify(data: string, secret: string, sig: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ── COBRO — link de pago que la tienda manda al cliente ───────────

export interface CobrarPayload {
  a: number;    // amount
  c: string;    // currency
  m?: string;   // merchant Stripe account ID
  n: string;    // merchant name
  ph: string;   // merchant phone (para SMS comprobante)
  u: string;    // Stripe Checkout URL
  ts: number;   // timestamp
}

export async function buildCobrarLink(
  payload: Omit<CobrarPayload, "ts">,
  baseUrl: string,
  secret: string
): Promise<string> {
  const full: CobrarPayload = { ...payload, ts: Date.now() };
  const encoded = base64urlEncode(JSON.stringify(full));
  const sig = await hmacSign(encoded, secret);
  return `${baseUrl}/pagar?t=${encoded}&s=${sig}&type=cobro`;
}

export async function parseCobrarLink(
  token: string,
  sig: string,
  secret: string
): Promise<CobrarPayload | null> {
  const ok = await hmacVerify(token, secret, sig);
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(token))) as CobrarPayload;
    if (Date.now() > payload.ts + TTL_MS) return null;
    return payload;
  } catch { return null; }
}

// ── REMESA — link que el emisor manda al receptor ─────────────────

export interface RemesaPayload {
  amount: number;           // monto emisor
  currency: string;         // moneda emisor ("CAD")
  targetCountry: string;    // país destino ("MX")
  targetCurrency: string;   // moneda receptor ("MXN")
  targetAmount: number;     // monto receptor pre-calculado con FX
  senderPhone: string;      // celular emisor (E.164)
  senderName?: string;      // nombre emisor (para mostrar al receptor)
  recipientPhone: string;   // celular receptor (E.164)
  recipientName?: string;   // nombre receptor
  senderCardToken: string;  // token Airwallex del emisor — cifrado AES-256, nunca el PAN
  ts: number;               // timestamp
}

export async function buildRemesaLink(
  payload: Omit<RemesaPayload, "ts">,
  baseUrl: string,
  secret: string
): Promise<string> {
  const full: RemesaPayload = { ...payload, ts: Date.now() };
  const encoded = base64urlEncode(JSON.stringify(full));
  const sig = await hmacSign(encoded, secret);
  return `${baseUrl}/pagar?t=${encoded}&s=${sig}&type=remesa`;
}

export async function parseRemesaLink(
  token: string,
  sig: string,
  secret: string
): Promise<RemesaPayload | null> {
  const ok = await hmacVerify(token, secret, sig);
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(token))) as RemesaPayload;
    if (Date.now() > payload.ts + TTL_MS) return null;
    return payload;
  } catch { return null; }
}

// ── COMPROBANTE — firmado server-side, verificable, sin PII ──────

export interface ReceiptData {
  id: string;   // tx_id (Stripe session ID, público)
  a: number;    // amount
  c: string;    // currency
  n: string;    // nombre comercio / emisor
  ts: number;   // timestamp transacción
  tt?: string;  // tipo: "cobro" | "remesa"
}

// Llamar solo server-side (requiere LINK_SECRET)
export async function buildReceiptURL(
  receipt: ReceiptData,
  baseUrl: string,
  secret: string
): Promise<string> {
  const dataB64 = base64urlEncode(JSON.stringify(receipt));
  const sig = await hmacSign(dataB64, secret);
  return `${baseUrl}/resultado?r=${dataB64}.${sig}`;
}

// Verificar server-side (requiere LINK_SECRET)
export async function verifyReceiptToken(
  token: string,  // "dataB64.sigB64"
  secret: string
): Promise<ReceiptData | null> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const dataB64 = token.slice(0, dot);
  const sigB64  = token.slice(dot + 1);
  const ok = await hmacVerify(dataB64, secret, sigB64);
  if (!ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(dataB64))) as ReceiptData;
  } catch { return null; }
}

// Decodificar client-side (sin verificar firma — render optimista)
export function parseReceiptURL(token: string): ReceiptData | null {
  try {
    const dataB64 = token.includes(".") ? token.slice(0, token.lastIndexOf(".")) : token;
    return JSON.parse(new TextDecoder().decode(base64urlDecode(dataB64))) as ReceiptData;
  } catch { return null; }
}
