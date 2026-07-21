// ─────────────────────────────────────────────────────────────────────────────
// lib/fees-v2.ts
//
// Motor de cálculo de fees para el motor P2P multi-proveedor v2.
//
// REGLAS DE NEGOCIO GRABADAS A FUEGO (no cambian con el proveedor):
//   México:          1% + $0.99 USD
//   Resto del mundo: 1% + $2.49 USD
//
// Estas reglas son independientes del proveedor activo.
// Cambiar proveedor NO cambia lo que cobra OmniPay al usuario final.
// ─────────────────────────────────────────────────────────────────────────────

// ── Constantes de fee por corredor ───────────────────────────────────────────

const FEE_PCT       = 0.01;   // 1% sobre USDC neto recibido
const FEE_FLAT_MX   = 0.99;   // flat fee para México (USD)
const FEE_FLAT_INTL = 2.49;   // flat fee para resto del mundo (USD)
const FEE_MIN_MX    = 2.50;   // mínimo absoluto para MX (USD)
const FEE_MIN_INTL  = 3.99;   // mínimo absoluto para global (USD)

// Países del corredor "MX" a efectos de tarificación
// (todos usan el flat fee de México)
const MX_FEE_COUNTRIES = new Set(["MX", "BR", "CO", "AR"]);

export type FeeCorridorType = "mx" | "global";

export interface FeeBreakdown {
  corridor:             FeeCorridorType;
  usdc_gross:           number;  // USDC que llega a la wallet de OmniPay (antes de fee)
  payin_fee_estimate:   number;  // fee estimado del proveedor de entrada (~2.5%)
  omnipay_fee_pct:      number;  // fee % de OmniPay (siempre 1%)
  omnipay_fee_flat:     number;  // fee flat de OmniPay ($0.99 MX / $2.49 global)
  omnipay_fee_total:    number;  // total fee OmniPay (max del mínimo)
  usdc_net:             number;  // USDC que se envía al proveedor de salida
  total_sender_pays_usd: number; // lo que paga el pagador al abrir el widget
  fx_buffer_usd:        number;  // buffer FX adicional (solo en rutas de doble conversión)
  route_note:           string;  // descripción del corredor para el UI
}

/**
 * Calcula el desglose completo de fees para una transacción P2P.
 *
 * @param usdcGross   — USDC que OmniPay recibe después del proveedor de entrada
 * @param country     — País ISO-3166 destino (ej: "MX", "DE")
 * @param payinFeePct — Fee del proveedor de entrada (ej: 0.025 para Ramp)
 * @param fxBuffer    — True si el corredor usa doble conversión (USDC→CAD→local)
 */
export function calcFeeBreakdown(
  usdcGross:   number,
  country:     string,
  payinFeePct  = 0.025,
  fxBuffer     = false,
): FeeBreakdown {
  const corridor    = MX_FEE_COUNTRIES.has(country.toUpperCase()) ? "mx" : "global";
  const feeFlat     = corridor === "mx" ? FEE_FLAT_MX : FEE_FLAT_INTL;
  const feeMin      = corridor === "mx" ? FEE_MIN_MX  : FEE_MIN_INTL;
  const fxBufferAmt = fxBuffer ? usdcGross * 0.0075 : 0;

  const payinFeeEst = usdcGross * payinFeePct;
  const rawOmniPay  = Math.max(usdcGross * FEE_PCT, feeMin) + feeFlat + fxBufferAmt;
  const omnipayFee  = parseFloat(rawOmniPay.toFixed(4));
  const usdcNet     = parseFloat(Math.max(0, usdcGross - omnipayFee).toFixed(6));

  // El pagador paga: USDC gross + fee del proveedor de entrada
  const totalSenderPays = parseFloat((usdcGross + payinFeeEst).toFixed(2));

  return {
    corridor,
    usdc_gross:            parseFloat(usdcGross.toFixed(6)),
    payin_fee_estimate:    parseFloat(payinFeeEst.toFixed(4)),
    omnipay_fee_pct:       FEE_PCT * 100,
    omnipay_fee_flat:      feeFlat,
    omnipay_fee_total:     omnipayFee,
    usdc_net:              usdcNet,
    total_sender_pays_usd: totalSenderPays,
    fx_buffer_usd:         parseFloat(fxBufferAmt.toFixed(4)),
    route_note: corridor === "mx"
      ? `LATAM · Fee: 1% + $${feeFlat} USD`
      : `Global · Fee: 1% + $${feeFlat} USD`,
  };
}

/**
 * Calcula cuánto USDC debe llegar para que el receptor reciba exactamente
 * `targetLocalAmount` en su moneda local.
 *
 * @param targetLocalAmount — Monto en moneda local que quiere recibir
 * @param usdcPerLocal      — Tasa: cuántos USDC vale 1 unidad de moneda local
 * @param country           — País destino
 */
export function calcUsdcNeeded(
  targetLocalAmount: number,
  usdcPerLocal:      number,
  country:           string,
): { usdcGross: number; breakdown: FeeBreakdown } {
  const corridor = MX_FEE_COUNTRIES.has(country.toUpperCase()) ? "mx" : "global";
  const feeFlat  = corridor === "mx" ? FEE_FLAT_MX  : FEE_FLAT_INTL;
  const feeMin   = corridor === "mx" ? FEE_MIN_MX   : FEE_MIN_INTL;

  // USDC que necesita llegar al receptor (antes del fee de OmniPay)
  const usdcForRecipient = targetLocalAmount * usdcPerLocal;

  // Despejar la ecuación: usdcGross - max(usdcGross * 1%, minFee) - flat = usdcForRecipient
  // Aproximación lineal (suficiente para el quote):
  const estimatedGross = (usdcForRecipient + feeFlat + feeMin) / (1 - FEE_PCT);
  const breakdown = calcFeeBreakdown(estimatedGross, country);

  return {
    usdcGross: parseFloat(estimatedGross.toFixed(6)),
    breakdown,
  };
}

/** Devuelve el tipo de corredor para un país */
export function getCorridorType(country: string): FeeCorridorType {
  return MX_FEE_COUNTRIES.has(country.toUpperCase()) ? "mx" : "global";
}
