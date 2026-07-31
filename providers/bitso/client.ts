// ─────────────────────────────────────────────────────────────────────────────
// providers/bitso/client.ts
//
// HTTP client for Bitso API with HMAC-SHA256 authentication.
// Bitso auth differs from Bridge — each request gets a unique nonce + signature.
//
// Auth header: Authorization: Bitso {key}:{nonce}:{signature}
//   nonce     = 13-digit epoch + 1–6 digit random salt  (e.g. "16789012345671234")
//   signature = HMAC-SHA256(secret, nonce + METHOD + /v3/path + body)
//
// IMPORTANT: the path signed MUST include /v3 (e.g. "/v3/withdrawals"),
// even though BITSO_API_BASE already ends in /v3.
//
// Env vars:
//   BITSO_API_KEY    — Bitso API key
//   BITSO_API_SECRET — Bitso API secret
//   BITSO_API_BASE   — Default: https://api.bitso.com/v3
//                      Staging:  https://api-stage.bitso.com/v3
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac } from "crypto";

const BASE = process.env.BITSO_API_BASE ?? "https://api.bitso.com/v3";

export class BitsoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BitsoError";
  }
}

function buildNonce(): string {
  return String(Date.now()) + String(Math.floor(Math.random() * 1_000_000));
}

// path must be /v3/something — include /v3 explicitly
function buildSignature(
  secret: string,
  nonce:  string,
  method: string,
  path:   string,
  body:   string,
): string {
  const msg = nonce + method.toUpperCase() + path + body;
  return createHmac("sha256", secret).update(msg).digest("hex");
}

export async function bitsoRequest<T>(
  method:  "GET" | "POST" | "DELETE",
  // path relative to /v3, e.g. "/withdrawals" — we prepend /v3 for signing
  path:    string,
  body?:   unknown,
): Promise<T> {
  const apiKey    = process.env.BITSO_API_KEY    ?? "";
  const apiSecret = process.env.BITSO_API_SECRET ?? "";

  if (!apiKey || !apiSecret) {
    throw new BitsoError("BITSO_API_KEY or BITSO_API_SECRET not configured", "missing_credentials", 0);
  }

  const nonce       = buildNonce();
  const bodyStr     = body !== undefined ? JSON.stringify(body) : "";
  const signedPath  = `/v3${path}`;   // signing path includes /v3
  const signature   = buildSignature(apiSecret, nonce, method, signedPath, bodyStr);

  const headers: Record<string, string> = {
    "Authorization": `Bitso ${apiKey}:${nonce}:${signature}`,
    "Content-Type":  "application/json",
  };

  const res  = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? bodyStr : undefined,
  });

  const json = await res.json() as { success: boolean; payload?: T; error?: { code?: string; message?: string } };

  if (!res.ok || !json.success) {
    const errCode = json.error?.code    ?? String(res.status);
    const errMsg  = json.error?.message ?? `Bitso HTTP ${res.status}`;
    throw new BitsoError(errMsg, errCode, res.status);
  }

  return json.payload as T;
}
