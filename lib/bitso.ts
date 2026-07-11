// Bitso Business API — USDC → local fiat → local rail (SPEI / PIX / PSE / CBU)
//
// Credenciales requeridas en Vercel:
//   BITSO_API_KEY              — API key de Bitso Business
//   BITSO_API_SECRET           — Secret para firma HMAC-SHA256
//   OMNIPAY_BITSO_USDC_ADDRESS — Dirección Polygon donde llega el USDC de Ramp/Transak

const BITSO_BASE = "https://bitso.com/api/v3";

// ── Fee constants ─────────────────────────────────────────────────────────────
export const P2P_FEE_PCT  = 0.01;    // 1% take-rate
export const P2P_FEE_MIN  = 2.50;    // $2.50 USD minimum (up from $1.99)
export const P2P_FEE_FLAT = 0.99;    // $0.99 flat operational fee
export const FX_BUFFER    = 0.0075;  // 0.75% — only when Wise emergency route (double FX hop)
export const RAMP_FEE_EST = 0.025;   // ~2.5% Ramp/Transak pay-in fee (shown in breakdown)

// ── Calcular fee OmniPay P2P ──────────────────────────────────────────────────
// isWiseEmergencyRoute = true when Bitso fails for LATAM → Wise fallback (USDC→CAD→MXN = 2 hops)
export function calcP2PFee(usdcAmount: number, isWiseEmergencyRoute = false): number {
  const dynamicBuffer = isWiseEmergencyRoute ? usdcAmount * FX_BUFFER : 0;
  return Math.max(usdcAmount * P2P_FEE_PCT, P2P_FEE_MIN) + P2P_FEE_FLAT + dynamicBuffer;
}

// Full fee breakdown object (used by /api/v1/p2p/rate and UI)
export interface P2PFeeBreakdown {
  amount_principal:      number;  // what recipient gets (in target currency)
  ramp_fee_estimate:     number;  // ~2.5% of usdc_subtotal (Ramp/Transak charges payer)
  omnipay_platform_fee:  number;  // calcP2PFee result
  network_delivery_fee:  number;  // live partner cost (Wise spread or Bitso ~0)
  fx_buffer_applied:     boolean;
  usdc_subtotal:         number;  // USDC OmniPay receives (before fee)
  total_sender_pays:     number;  // usdc_subtotal + ramp_fee_estimate
  route_used:            "bitso" | "wise_emergency";
}

// ── Firma de requests Bitso (HMAC-SHA256) ─────────────────────────────────────
async function buildBitsoAuth(
  apiKey:      string,
  apiSecret:   string,
  httpMethod:  string,
  requestPath: string,
  payload:     string,
): Promise<string> {
  const nonce   = Date.now().toString();
  const message = nonce + httpMethod.toUpperCase() + requestPath + payload;
  const enc     = new TextEncoder();
  const key     = await crypto.subtle.importKey(
    "raw", enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Bitso ${apiKey}:${nonce}:${sigHex}`;
}

// ── Tasa de cambio en vivo USDC/MXN ───────────────────────────────────────────
export async function getBitsoUSDCRate(book = "usdc_mxn"): Promise<number> {
  const res  = await fetch(`${BITSO_BASE}/ticker/?book=${book}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Bitso ticker error: ${res.status}`);
  const data = await res.json() as { payload?: { last?: string } };
  const rate = parseFloat(data.payload?.last ?? "0");
  if (!rate) throw new Error(`Bitso: tasa ${book} no disponible`);
  return rate;
}

// ── Ejecutar retiro SPEI / local rail desde Bitso ────────────────────────────
export async function executeBitsoSPEI(
  apiKey:     string,
  apiSecret:  string,
  clabe:      string,
  nombre:     string,
  usdcAmount: number,
  reference:  string,
): Promise<string> {
  const path    = "/withdrawals/";
  const payload = JSON.stringify({
    currency:             "usdc",
    amount:               usdcAmount.toFixed(6),
    network:              "polygon",
    destination_account:  clabe,
    beneficiary_name:     nombre,
    numeric_ref:          reference.replace(/\D/g, "").slice(0, 7) || "0000001",
    payment_concept:      "OmniPay remittance",
    rfc_curp_clabe:       clabe,
    method:               "sp",  // SPEI (MX); Bitso uses same endpoint for PIX/PSE via other methods
  });

  const auth = await buildBitsoAuth(apiKey, apiSecret, "POST", path, payload);
  const res  = await fetch(`${BITSO_BASE}${path}`, {
    method:  "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body:    payload,
  });

  const data = await res.json() as { payload?: { wid?: string }; error?: { message?: string } };
  if (!res.ok || !data.payload?.wid) {
    const msg = data.error?.message ?? `Bitso SPEI error ${res.status}`;
    if (res.status === 422 || msg.toLowerCase().includes("clabe")) {
      throw Object.assign(new Error(msg), { code: "INVALID_CLABE" });
    }
    throw new Error(msg);
  }
  return data.payload.wid;
}

// ── Card payout via Bitso (Visa Direct / MC Send for LATAM) ──────────────────
// Throws { code: "CARD_RAIL_UNAVAILABLE" } if Bitso doesn't support card for this corridor
// → webhook falls back to Wise Visa Direct automatically
export async function executeBitsoCard(
  apiKey:     string,
  apiSecret:  string,
  cardNumber: string,
  nombre:     string,
  usdcAmount: number,
  reference:  string,
): Promise<string> {
  const path    = "/withdrawals/";
  const payload = JSON.stringify({
    currency:            "usdc",
    amount:              usdcAmount.toFixed(6),
    network:             "polygon",
    destination_account: cardNumber.replace(/\s/g, ""),
    beneficiary_name:    nombre,
    numeric_ref:         reference.replace(/\D/g, "").slice(0, 7) || "0000001",
    payment_concept:     "OmniPay card payout",
    method:              "card",  // Bitso card rail
  });

  const auth = await buildBitsoAuth(apiKey, apiSecret, "POST", path, payload);
  const res  = await fetch(`${BITSO_BASE}${path}`, {
    method:  "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body:    payload,
  });

  const data = await res.json() as { payload?: { wid?: string }; error?: { message?: string; code?: string } };
  if (!res.ok || !data.payload?.wid) {
    const msg  = data.error?.message ?? `Bitso card error ${res.status}`;
    const code = data.error?.code ?? "";
    if (res.status === 404 || code === "UNSUPPORTED" || msg.toLowerCase().includes("card")) {
      throw Object.assign(new Error("Card rail unavailable"), { code: "CARD_RAIL_UNAVAILABLE" });
    }
    if (res.status === 422) {
      throw Object.assign(new Error(msg), { code: "INVALID_CARD" });
    }
    throw new Error(msg);
  }
  return data.payload.wid;
}
