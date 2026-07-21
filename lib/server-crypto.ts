// ─────────────────────────────────────────────────────────────────────────────
// lib/server-crypto.ts
//
// Utilidades criptográficas para el lado del servidor (Node.js / Edge).
// Descifra los tokens generados por /api/v1/p2p/checkout.
//
// NO usar en client components — este archivo puede importar Buffer.
// ─────────────────────────────────────────────────────────────────────────────

// P2PToken — previously in /api/v1/p2p/checkout/route (now replaced by /api/bridge/checkout)
export interface P2PToken {
  account:          string;
  payout_method:    "bank" | "card";
  nombre:           string;
  amount_target:    number;
  target_currency:  string;
  target_country:   string;
  recipient_phone?: string;
  payer_phone?:     string;
  created_at:       number;
}

/**
 * Descifra un partnerOrderId generado por /api/v1/p2p/checkout.
 * El token es: base64url(iv[12] + ciphertext)
 * Cifrado con AES-256-GCM usando LINK_SECRET (primeros 32 chars).
 */
export async function decryptCheckoutToken(token: string): Promise<P2PToken> {
  const secret = process.env.LINK_SECRET ?? "dev-secret";
  const key    = secret.slice(0, 32).padEnd(32, "0");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    "AES-GCM",
    false,
    ["decrypt"],
  );

  // base64url → Uint8Array
  const padded   = token.replace(/-/g, "+").replace(/_/g, "/");
  const padding  = (4 - (padded.length % 4)) % 4;
  const binary   = atob(padded + "=".repeat(padding));
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);

  const iv         = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as P2PToken;
}
