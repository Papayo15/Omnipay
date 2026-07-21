// OmniPay fee engine — multi-provider (Bridge + Paysend + B2B)
//
// Three channels, each with its own cost structure:
//   bridge  → MX/US/BR/GB/CO/SEPA — native bank rails via Bridge.xyz
//   paysend → 170+ countries — card push via Paysend/Zuba
//   b2b     → Stripe capture + Bridge payout for businesses
//
// OmniPay charges: 0.50% + flat on all channels (min $1.99)
// Provider costs are passed through transparently.
// KYC ($2 P2P / $10 KYB B2B) charged only on first transaction — Opción A dynamic check.
//
// Competitive position on $300 USD (Bridge channel):
//   WU ~$17 · Remitly ~$7.50 · Wise ~$6.40
//   OmniPay 1ª vez: $6.74 · OmniPay recurrente: $4.74 ← cheapest in market

import { findCustomerByEmail } from "@/providers/bridge/customers";
import { NATIVE_RAILS }        from "@/providers/bridge/liquidation";

// ── Constants ────────────────────────────────────────────────────────────────

// Bridge costs (fixed, non-negotiable)
export const BRIDGE_ONRAMP_PCT  = 0.005;   // 0.50% fiat → USDC
export const BRIDGE_OFFRAMP_PCT = 0.0025;  // 0.25% USDC → local fiat
export const BRIDGE_TOTAL_PCT   = BRIDGE_ONRAMP_PCT + BRIDGE_OFFRAMP_PCT; // 0.75%

// OmniPay margin
export const OMNIPAY_SERVICE_PCT = 0.005;  // 0.50% OmniPay net revenue
export const OMNIPAY_FLAT_P2P    = 0.99;
export const OMNIPAY_FLAT_B2B    = 1.99;  // covers Bridge VA $2/month in B2B
export const OMNIPAY_MIN_FEE     = 1.99;  // minimum total OmniPay fee

// One-time KYC/KYB (pass-through to Bridge)
export const KYC_FEE_P2P = 2.00;
export const KYB_FEE_B2B = 10.00;

// Paysend estimated costs (update when enterprise contract arrives)
export const PAYSEND_PCT  = 0.015;  // ~1.50% enterprise estimate
export const PAYSEND_FLAT = 0.50;   // $0.50 flat

// ── Types ────────────────────────────────────────────────────────────────────

export type QuoteProvider = "bridge" | "paysend" | "b2b";

export interface FeeQuote {
  amount_principal:    number;
  provider:            QuoteProvider;
  // Provider costs
  bridge_onramp?:      number;
  bridge_offramp?:     number;
  paysend_cost?:       number;
  provider_cost_total: number;
  // OmniPay
  omnipay_service:     number;
  omnipay_flat:        number;
  omnipay_net_revenue: number;
  // KYC
  kyc_surcharge:       number;
  is_new_customer:     boolean;
  // Total
  total_sender_pays:   number;
}

// ── Static quote (no KYC lookup — for UI preview or when email not yet known) ─

export function calcStaticQuote(
  amount:  number,
  country: string,
  type:    "p2p" | "b2b",
  isNew:   boolean = true,
): FeeQuote {
  const provider: QuoteProvider = type === "b2b"       ? "b2b"
    : NATIVE_RAILS[country.toUpperCase()]               ? "bridge"
    : "paysend";

  return _buildQuote(amount, provider, type, isNew);
}

// ── Dynamic quote (Opción A) — checks Bridge for existing KYC ────────────────

export async function buildDynamicQuote(params: {
  amount:  number;
  country: string;
  email:   string;
  type:    "p2p" | "b2b";
}): Promise<FeeQuote> {
  const { amount, country, email, type } = params;

  // Bridge is our DB — conservative fallback to isNew=true if lookup fails
  let isNew = true;
  try {
    const existing = await findCustomerByEmail(email);
    if (existing) {
      isNew = type === "b2b"
        ? existing.kyb_status !== "approved"
        : existing.kyc_status !== "approved" && existing.status !== "active";
    }
  } catch { /* network error — assume new customer */ }

  const provider: QuoteProvider = type === "b2b"       ? "b2b"
    : NATIVE_RAILS[country.toUpperCase()]               ? "bridge"
    : "paysend";

  return _buildQuote(amount, provider, type, isNew);
}

// ── Internal ─────────────────────────────────────────────────────────────────

function _buildQuote(
  amount:   number,
  provider: QuoteProvider,
  type:     "p2p" | "b2b",
  isNew:    boolean,
): FeeQuote {
  const flat   = type === "b2b" ? OMNIPAY_FLAT_B2B : OMNIPAY_FLAT_P2P;
  const kyc    = isNew ? (type === "b2b" ? KYB_FEE_B2B : KYC_FEE_P2P) : 0;

  let providerCostTotal: number;
  let bridgeOnramp: number | undefined;
  let bridgeOfframp: number | undefined;
  let paysendCost: number | undefined;

  if (provider === "bridge" || provider === "b2b") {
    bridgeOnramp  = parseFloat((amount * BRIDGE_ONRAMP_PCT).toFixed(2));
    bridgeOfframp = parseFloat((amount * BRIDGE_OFFRAMP_PCT).toFixed(2));
    providerCostTotal = bridgeOnramp + bridgeOfframp;
  } else {
    paysendCost       = parseFloat((amount * PAYSEND_PCT + PAYSEND_FLAT).toFixed(2));
    providerCostTotal = paysendCost;
  }

  const omnipayService = parseFloat(
    Math.max(amount * OMNIPAY_SERVICE_PCT, OMNIPAY_MIN_FEE).toFixed(2)
  );
  const omnipayRev = parseFloat((omnipayService + flat).toFixed(2));
  const total      = parseFloat((amount + providerCostTotal + omnipayRev + kyc).toFixed(2));

  return {
    amount_principal:    amount,
    provider,
    bridge_onramp:       bridgeOnramp,
    bridge_offramp:      bridgeOfframp,
    paysend_cost:        paysendCost,
    provider_cost_total: parseFloat(providerCostTotal.toFixed(2)),
    omnipay_service:     omnipayService,
    omnipay_flat:        flat,
    omnipay_net_revenue: omnipayRev,
    kyc_surcharge:       kyc,
    is_new_customer:     isNew,
    total_sender_pays:   total,
  };
}
