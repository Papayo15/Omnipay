// Conduit Webhook Signature Verification — HMAC-SHA256
// Header: X-Conduit-Signature
// Format: "v1=<hex>" — possibly multiple segments during key rotation grace periods:
//   "v1=<hex1> v1=<hex2>" — accept if ANY segment matches.

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

  // Compute HMAC-SHA256 of the raw body
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

  // Header format: "v1=<hex>" — extract hex portion(s)
  // During secret rotation, Conduit sends multiple segments: "v1=<a> v1=<b>"
  const segments = signatureHeader.split(/\s+/);
  for (const seg of segments) {
    const hex = seg.startsWith("v1=") ? seg.slice(3) : seg;
    if (hex.length !== computed.length) continue;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hex.charCodeAt(i);
    if (diff === 0) return true;
  }
  return false;
}

export function parseConduitWebhookEvent(rawBody: string): ConduitWebhookEvent {
  return JSON.parse(rawBody) as ConduitWebhookEvent;
}
