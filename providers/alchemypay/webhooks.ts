// Alchemy Pay Webhook Signature Verification
//
// Alchemy Pay signs async notifications the same way it signs outbound requests:
// HMAC-SHA256 over `timestamp + POST + requestPath + sortedBodyString`, base64-encoded,
// using our ALCHEMYPAY_APP_SECRET. `requestPath` is the path portion of the
// `callbackUrl` we registered (without domain). Body params are sorted
// alphabetically, empty values dropped, and the `signature`/`newSignature` fields
// themselves excluded before signing.
//
// Docs: https://alchemypay.readme.io/docs/webhook-signature

function sortedBodyStringExcludingSignature(body: Record<string, unknown>): string {
  const entries = Object.entries(body)
    .filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "signature" && k !== "newSignature")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyAlchemyPayWebhook(
  requestPath: string,
  timestampHeader: string | null,
  body: Record<string, unknown>,
): Promise<boolean> {
  const secret = process.env.ALCHEMYPAY_WEBHOOK_SECRET ?? process.env.ALCHEMYPAY_APP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ALCHEMYPAY_WEBHOOK_SECRET (or ALCHEMYPAY_APP_SECRET) must be configured in production");
    }
    console.warn("[alchemypay/webhook] No verification secret set — skipping (dev only)");
    return true;
  }
  if (!timestampHeader) return false;

  const received = String(body.newSignature ?? body.signature ?? "");
  if (!received) return false;

  const toSign   = `${timestampHeader}POST${requestPath}${sortedBodyStringExcludingSignature(body)}`;
  const computed = await hmacSign(toSign, secret);

  if (computed.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

// ── On-ramp order webhook — fires only for PAY_FAIL, PAY_SUCCESS, FINISHED ────
export interface OnRampWebhookPayload {
  merchantOrderNo: string;
  orderNo:         string;
  status:          "PAY_FAIL" | "PAY_SUCCESS" | "FINISHED";
  crypto?:         string;
  cryptoAmount?:   string;
  network?:        string;
  address?:        string;
  txHash?:         string;
}

// ── Off-ramp order webhook — creation, USDC received, payout started/succeeded/
//    failed, refunded, expired (see OffRampStatusCode in offramp.ts) ──────────
export interface OffRampWebhookPayload {
  merchantOrderNo: string;
  orderNo:         string;
  status:          string;
  txHash?:         string;
  fiatAmount?:     string;
  cryptoActualAmount?: string;
}

// ── KYC webhook — fired at callbackUrl once Alchemy Pay finishes verifying the user
export interface KycWebhookPayload {
  userNo:       string;
  email?:       string;
  kycStatus:    "COMPLETED" | "REJECTED";
  kycStartTime?: string;
}
