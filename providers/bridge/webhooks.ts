// Bridge.xyz Webhook Signature Verification
// Bridge signs webhook payloads with RSA-SHA256 using a per-endpoint private key.
// The matching public key is shown in the Bridge dashboard (-----BEGIN PUBLIC KEY-----)
// Store it in BRIDGE_WEBHOOK_PUBLIC_KEY env var (the full PEM string).
// Header sent by Bridge: X-Bridge-Signature: <base64-encoded RSA signature>

export interface BridgeWebhookEvent {
  id:         string;
  type:       string;
  data:       Record<string, unknown>;
  created_at: string;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

export async function verifyBridgeWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const publicKeyPem = process.env.BRIDGE_WEBHOOK_PUBLIC_KEY;
  const hmacSecret   = process.env.BRIDGE_WEBHOOK_SECRET;

  // No credentials configured → block in production, warn in dev
  if (!publicKeyPem && !hmacSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BRIDGE_WEBHOOK_PUBLIC_KEY or BRIDGE_WEBHOOK_SECRET must be configured in production");
    }
    console.warn("[bridge/webhook] No verification credentials set — skipping (dev only)");
    return true;
  }
  if (!signatureHeader) return false;

  // RSA-SHA256 (Bridge default — public key from dashboard)
  if (publicKeyPem) {
    try {
      const keyBuf = pemToArrayBuffer(publicKeyPem);
      const cryptoKey = await crypto.subtle.importKey(
        "spki",
        keyBuf,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const sigBinary = atob(signatureHeader.replace(/\s+/g, ""));
      const sigBuf    = new Uint8Array(sigBinary.length);
      for (let i = 0; i < sigBinary.length; i++) sigBuf[i] = sigBinary.charCodeAt(i);

      return await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        sigBuf,
        new TextEncoder().encode(rawBody),
      );
    } catch (e) {
      console.error("[bridge/webhook] RSA verification error:", e);
      return false;
    }
  }

  // HMAC-SHA256 fallback (format: "sha256=<hex>")
  if (hmacSecret) {
    const [algo, hex] = signatureHeader.split("=");
    if (algo !== "sha256" || !hex) return false;

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(hmacSecret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign"],
    );
    const sig     = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    if (computed.length !== hex.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hex.charCodeAt(i);
    return diff === 0;
  }

  return false;
}

export function parseWebhookEvent(rawBody: string): BridgeWebhookEvent {
  return JSON.parse(rawBody) as BridgeWebhookEvent;
}
