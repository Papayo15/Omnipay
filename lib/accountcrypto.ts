// AES-256-GCM stateless encryption for sensitive payment data embedded in HMAC links.
// Uses Web Crypto API — compatible with Edge runtime and Node.js.
// Key is derived from LINK_SECRET via SHA-256 to always produce a valid 256-bit AES key.

const IV_BYTES = 12; // 96-bit IV — mandatory for AES-GCM

export type ReceiveMode = "bank" | "card" | "wallet";

export interface SecurePayload {
  account: string;           // CLABE/IBAN/ACH → bank | 16 dígitos → card | phone/ID → wallet
  receiveMode?: ReceiveMode; // rail de dispersión — undefined = "bank" (Wise)
  recipientPhone?: string;   // E.164 — for SMS/WhatsApp notification to recipient
  senderPhone?: string;      // E.164 — for SMS/WhatsApp notification to sender/payer
}

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET env var is not set");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptPayload(payload: SecurePayload): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  // Pack: iv(12 bytes) + ciphertext+authTag — then base64url
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.byteLength);
  return toBase64url(packed);
}

export async function decryptPayload(encoded: string): Promise<SecurePayload> {
  const key = await importKey();
  const packed = fromBase64url(encoded);
  const iv = packed.slice(0, IV_BYTES);
  const ciphertext = packed.slice(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as SecurePayload;
}

function toBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function fromBase64url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return Uint8Array.from(atob(b + pad), (c) => c.charCodeAt(0));
}
