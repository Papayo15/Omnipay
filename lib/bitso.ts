// Bitso Business API — USDC → MXN → SPEI
//
// Credenciales requeridas en Vercel:
//   BITSO_API_KEY             — API key de Bitso Business
//   BITSO_API_SECRET          — Secret para firma HMAC-SHA256
//   OMNIPAY_BITSO_USDC_ADDRESS — Dirección Polygon donde llega el USDC de Ramp/Transak
//
// Sin credenciales → las funciones retornan error inmediato (no silencioso)
// para que el webhook P2P responda 503 y el proveedor reintente.

const BITSO_BASE = "https://bitso.com/api/v3";

// ── Firma de requests Bitso (HMAC-SHA256) ─────────────────────────────────────
async function buildBitsoAuth(
  apiKey: string,
  apiSecret: string,
  httpMethod: string,
  requestPath: string,
  payload: string,
): Promise<string> {
  const nonce     = Date.now().toString();
  const message   = nonce + httpMethod.toUpperCase() + requestPath + payload;
  const enc       = new TextEncoder();
  const key       = await crypto.subtle.importKey(
    "raw", enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig       = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const sigHex    = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Bitso ${apiKey}:${nonce}:${sigHex}`;
}

// ── Tasa de cambio en vivo USDC/MXN ───────────────────────────────────────────
export async function getBitsoUSDCRate(): Promise<number> {
  const res  = await fetch(`${BITSO_BASE}/ticker/?book=usdc_mxn`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Bitso ticker error: ${res.status}`);
  const data = await res.json() as { payload?: { last?: string } };
  const rate = parseFloat(data.payload?.last ?? "0");
  if (!rate) throw new Error("Bitso: tasa USDC/MXN no disponible");
  return rate;
}

// ── Calcular fee OmniPay P2P ──────────────────────────────────────────────────
// Fórmula: max(1% × usdc, $1.99) + $0.99 flat
export function calcP2PFee(usdcAmount: number): number {
  return Math.max(usdcAmount * 0.01, 1.99) + 0.99;
}

// ── Ejecutar retiro SPEI desde Bitso ─────────────────────────────────────────
export async function executeBitsoSPEI(
  apiKey:      string,
  apiSecret:   string,
  clabe:       string,
  nombre:      string,
  usdcAmount:  number,  // USDC neto a convertir y enviar (ya descontado fee OmniPay)
  reference:   string,  // ID de referencia para rastreo
): Promise<string> {
  const path    = "/withdrawals/";
  const payload = JSON.stringify({
    currency:    "usdc",
    amount:      usdcAmount.toFixed(6),
    network:     "polygon",
    destination_account: clabe,
    beneficiary_name:    nombre,
    numeric_ref:         reference.replace(/\D/g, "").slice(0, 7) || "0000001",
    payment_concept:     "OmniPay remittance",
    rfc_curp_clabe:      clabe,
    method:              "sp",  // SPEI
  });

  const auth = await buildBitsoAuth(apiKey, apiSecret, "POST", path, payload);

  const res = await fetch(`${BITSO_BASE}${path}`, {
    method:  "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body:    payload,
  });

  const data = await res.json() as { payload?: { wid?: string }; error?: { message?: string } };

  if (!res.ok || !data.payload?.wid) {
    const msg = data.error?.message ?? `Bitso SPEI error ${res.status}`;
    // CLABE inválida → error permanente (no reintentar)
    if (res.status === 422 || msg.toLowerCase().includes("clabe")) {
      throw Object.assign(new Error(msg), { code: "INVALID_CLABE" });
    }
    throw new Error(msg);
  }

  return data.payload.wid;
}
