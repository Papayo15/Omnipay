// Conduit Webhook Signature Verification — HMAC-SHA256
// Conduit signs payloads with HMAC-SHA256 using CONDUIT_WEBHOOK_SECRET.
// Signature header: x-conduit-signature (format: "sha256=<hex>")
// Mirrors providers/bridge/webhooks.ts HMAC branch.

import type { ConduitWebhookEvent } from "./types";

export async function verifyConduitWebhook(
  rawBody:         string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.CONDUIT_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CONDUIT_WEBHOOK_SECRET must be configured in production");
    }
    console.warn("[conduit/webhook] No CONDUIT_WEBHOOK_SECRET set — skipping (dev only)");
    return true;
  }

  if (!signatureHeader) return false;

  // Accept both "sha256=<hex>" and bare hex
  const hex = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig      = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  if (computed.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hex.charCodeAt(i);
  return diff === 0;
}

export function parseConduitWebhookEvent(rawBody: string): ConduitWebhookEvent {
  return JSON.parse(rawBody) as ConduitWebhookEvent;
}
