// OmniPay session — stores ONLY the Bridge customer ID (UUID) in an encrypted cookie.
// Zero PII: no name, email, CLABE, or any personal data is stored.
// Cookie flags: HttpOnly, Secure, SameSite=Lax — blocks XSS and CSRF.

import { cookies } from "next/headers";

const COOKIE_NAME = "op_sid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const IV_BYTES = 12;

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET env var is not set");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":session"));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return Uint8Array.from(atob(b + pad), (c) => c.charCodeAt(0));
}

export async function setCustomerSession(customerId: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(customerId);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.byteLength);
  const value = toBase64url(packed);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return value;
}

export async function getCustomerSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(COOKIE_NAME)?.value;
    if (!value) return null;

    const key = await importKey();
    const packed = fromBase64url(value);
    const iv = packed.slice(0, IV_BYTES);
    const ciphertext = packed.slice(IV_BYTES);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

export async function clearCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
