// On-ramp provider abstraction — Ramp Network + Transak
//
// Switch provider via env var: NEXT_PUBLIC_ONRAMP_PROVIDER=ramp|transak
// Both providers end up as OnRampTransaction before hitting the settlement pipeline.

export type OnRampProvider = "ramp" | "transak";

export interface OnRampTransaction {
  partnerOrderId: string;
  usdcAmount:     number;
  status:         "COMPLETED" | "PENDING" | "FAILED";
  rawStatus:      string;
  provider:       OnRampProvider;
}

// ── Payload normalizers ───────────────────────────────────────────────────────

export function normalizeRamp(body: Record<string, unknown>): OnRampTransaction {
  const rawStatus = String(body.status ?? body.type ?? "");
  const completed = rawStatus.toUpperCase() === "RELEASED" ||
                    rawStatus.toUpperCase().includes("COMPLET") ||
                    rawStatus.toUpperCase().includes("SUCCESS");
  return {
    partnerOrderId: String(body.partnerOrderId ?? body.partner_order_id ?? ""),
    usdcAmount:     parseFloat(String(body.cryptoAmount ?? body.crypto_amount ?? body.amount ?? "0")),
    status:         completed ? "COMPLETED" : rawStatus.toUpperCase().includes("FAIL") ? "FAILED" : "PENDING",
    rawStatus,
    provider:       "ramp",
  };
}

export function normalizeTransak(body: Record<string, unknown>): OnRampTransaction {
  // Transak wraps payload in a `data` field
  const data = (body.data ?? body) as Record<string, unknown>;
  const eventId   = String(body.eventID ?? body.event_id ?? "");
  const rawStatus = eventId || String(data.status ?? "");
  const completed = eventId === "ORDER_COMPLETED" || rawStatus.toUpperCase().includes("COMPLET");
  return {
    partnerOrderId: String(data.partnerOrderId ?? data.partner_order_id ?? data.orderId ?? ""),
    usdcAmount:     parseFloat(String(data.cryptoAmount ?? data.crypto_amount ?? "0")),
    status:         completed ? "COMPLETED" : rawStatus.toUpperCase().includes("FAIL") ? "FAILED" : "PENDING",
    rawStatus,
    provider:       "transak",
  };
}

export function normalizeOnRamp(
  body:     Record<string, unknown>,
  provider: OnRampProvider,
): OnRampTransaction {
  return provider === "transak" ? normalizeTransak(body) : normalizeRamp(body);
}

// ── Signature verification ────────────────────────────────────────────────────

async function hmac(algorithm: string, secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: algorithm }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyOnRampSignature(
  rawBody:  string,
  headers:  Headers,
  provider: OnRampProvider,
): Promise<boolean> {
  if (provider === "transak") {
    const secret = process.env.TRANSAK_WEBHOOK_SECRET ?? "";
    if (!secret) return true; // dev mode
    const incoming = (headers.get("x-transak-signature") ?? "").replace(/^sha512=/, "");
    if (!incoming) return false;
    const computed = await hmac("SHA-512", secret, rawBody);
    return constantTimeEqual(computed, incoming);
  }

  // Ramp — SHA-256
  const secret   = process.env.RAMP_WEBHOOK_SECRET ?? "";
  if (!secret) return true; // dev mode
  const incoming = (
    headers.get("x-body-signature") ?? headers.get("x-ramp-signature") ?? ""
  ).replace(/^sha256=/, "");
  if (!incoming) return false;
  const computed = await hmac("SHA-256", secret, rawBody);
  return constantTimeEqual(computed, incoming);
}

// ── Widget URL builder ────────────────────────────────────────────────────────
// Used by the frontend to embed the correct widget based on the provider env var.

export function buildOnRampWidgetUrl(params: {
  partnerOrderId: string;
  usdcAmount:     number;
  walletAddress:  string;
  finalUrl:       string;
  provider:       OnRampProvider;
}): string {
  const { partnerOrderId, usdcAmount, walletAddress, finalUrl, provider } = params;

  if (provider === "transak") {
    const apiKey = process.env.TRANSAK_API_KEY ?? process.env.NEXT_PUBLIC_TRANSAK_API_KEY ?? "";
    const q = new URLSearchParams({
      apiKey,
      cryptoCurrencyCode: "USDC",
      network:            "polygon",
      walletAddress,
      partnerOrderId,
      fiatAmount:         (usdcAmount * 1.025).toFixed(2), // estimate incl. Transak ~2.5%
      fiatCurrency:       "USD",
      redirectURL:        finalUrl,
    });
    return `https://global.transak.com/?${q.toString()}`;
  }

  // Ramp
  const apiKey = process.env.RAMP_API_KEY ?? process.env.NEXT_PUBLIC_RAMP_API_KEY ?? "";
  const q = new URLSearchParams({
    hostApiKey:     apiKey,
    swapAsset:      "POLYGON_USDC",
    swapAmount:     String(Math.round(usdcAmount * 1e6)), // micro-USDC
    userAddress:    walletAddress,
    partnerOrderId,
    finalUrl,
  });
  return `https://buy.ramp.network/?${q.toString()}`;
}
