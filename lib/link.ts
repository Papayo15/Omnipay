// Link signing — HMAC-SHA256 + Base64URL, TTL 5 minutos
// Reemplaza lib/payload.ts — sin AES, sin compresión, sin Zustand
// Todo stateless: el link es el estado.

const TTL_MS = 5 * 60 * 1000;

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return Uint8Array.from(atob(b + pad), (c) => c.charCodeAt(0));
}

async function sign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return base64url(sig);
}

async function verify(data: string, secret: string, sig: string): Promise<boolean> {
  const expected = await sign(data, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ── Payload de cobro (link de pago del cliente) ──────────────────

export interface CobrarPayload {
  a: number;    // amount
  c: string;    // currency
  m?: string;   // merchant Stripe account ID (optional pre-onboarding)
  n: string;    // merchant name
  ph: string;   // merchant phone (para SMS)
  u: string;    // Stripe Checkout URL
  ts: number;   // timestamp creación
}

export async function buildCobrarLink(
  payload: Omit<CobrarPayload, "ts">,
  baseUrl: string,
  secret: string
): Promise<string> {
  const full: CobrarPayload = { ...payload, ts: Date.now() };
  const data = JSON.stringify(full);
  const encoded = base64url(new TextEncoder().encode(data).buffer as ArrayBuffer);
  const sig = await sign(encoded, secret);
  return `${baseUrl}/pagar?t=${encoded}&s=${sig}`;
}

export async function parseCobrarLink(
  token: string,
  sig: string,
  secret: string
): Promise<CobrarPayload | null> {
  const ok = await verify(token, secret, sig);
  if (!ok) return null;
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(token));
    const payload = JSON.parse(decoded) as CobrarPayload;
    if (Date.now() > payload.ts + TTL_MS) return null;
    return payload;
  } catch { return null; }
}

// ── Receipt URL (comprobante sin PII) ────────────────────────────

export interface ReceiptData {
  id: string;   // tx_id de Stripe
  a: number;    // amount
  c: string;    // currency
  n: string;    // merchant name (no número de cuenta)
  ts: number;   // timestamp
  tt?: string;  // transaction type: "cobro" | "remesa"
}

export function buildReceiptURL(receipt: ReceiptData, baseUrl: string): string {
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(receipt)).buffer as ArrayBuffer);
  return `${baseUrl}/resultado?r=${encoded}`;
}

export function parseReceiptURL(token: string): ReceiptData | null {
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(token));
    return JSON.parse(decoded) as ReceiptData;
  } catch { return null; }
}
