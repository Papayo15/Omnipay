// Base HTTP client for Alchemy Pay's Open API (alchemypay.org — on-ramp/off-ramp,
// NOT to be confused with alchemy.com, which is unrelated node/RPC infra).
//
// Auth: every request is signed with HMAC-SHA256 over
//   timestamp + HTTP_METHOD + requestPath + bodyString
// where requestPath excludes the domain (query params sorted alphabetically),
// and bodyString is the POST body as JSON with keys sorted alphabetically and
// empty values removed (empty string for GET). The signature is base64-encoded
// and sent as `sign`, alongside `appid` and `timestamp` headers.
// Docs: https://alchemypay.readme.io/docs/api-sign

// Resolved lazily (inside alchemyPayRequest) rather than at module load — a
// module-level throw would blow up `next build`'s page-data collection for any
// route that imports this file, even when the request is never actually made.
function getBase(): string {
  const b = process.env.ALCHEMYPAY_API_BASE;
  if (!b && process.env.NODE_ENV === "production") {
    throw new Error("ALCHEMYPAY_API_BASE must be set in production. Add it to your Vercel environment variables.");
  }
  return b ?? "https://openapi-test.alchemypay.org";
}

export class AlchemyPayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AlchemyPayError";
  }
}

function sortedBodyString(body: Record<string, unknown> | undefined): string {
  if (!body) return "";
  const entries = Object.entries(body)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

function sortedQueryString(query: Record<string, string> | undefined): string {
  if (!query || Object.keys(query).length === 0) return "";
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return `?${entries.map(([k, v]) => `${k}=${v}`).join("&")}`;
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

export async function alchemyPayRequest<T>(
  method: "GET" | "POST",
  path: string,
  opts: { body?: Record<string, unknown>; query?: Record<string, string> } = {},
): Promise<T> {
  const appId  = process.env.ALCHEMYPAY_APP_ID     ?? "";
  const secret = process.env.ALCHEMYPAY_APP_SECRET ?? "";
  if (!appId || !secret) throw new AlchemyPayError("ALCHEMYPAY_APP_ID / ALCHEMYPAY_APP_SECRET not configured", "missing_credentials", 0);

  const timestamp   = String(Date.now());
  const queryString = sortedQueryString(opts.query);
  const bodyString  = method === "GET" ? "" : sortedBodyString(opts.body);
  const toSign      = `${timestamp}${method}${path}${queryString}${bodyString}`;
  const sign        = await hmacSign(toSign, secret);

  const url = `${getBase()}${path}${queryString}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      appid:          appId,
      timestamp,
      sign,
    },
    body: method === "GET" ? undefined : (bodyString || "{}"),
  });

  const data = await res.json() as Record<string, unknown>;

  // Alchemy Pay wraps responses as { success, code, message, data } (business error even on HTTP 200)
  const success = data.success === true || data.code === "0000" || data.code === "0";
  if (!res.ok || !success) {
    const msg = (data.message as string) ?? (data.returnMsg as string) ?? `Alchemy Pay ${res.status}`;
    const code = (data.code as string) ?? (data.returnCode as string) ?? String(res.status);
    const err = new AlchemyPayError(msg, code, res.status);
    (err as AlchemyPayError & { details: unknown }).details = data;
    throw err;
  }

  return (data.data ?? data) as T;
}
