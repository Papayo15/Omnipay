// OmniPay fee engine — Bridge.xyz as single provider
//
// Fee structure (v2, Bridge-only):
//   Bridge on-ramp:   0.50% of principal
//   Bridge off-ramp:  0.25% of principal
//   OmniPay service:  1.25% of principal  ← OmniPay net revenue
//   Flat fee:         $0.99 P2P / $1.99 B2B
//   KYC surcharge:    $2 (P2P first time) / $10 (B2B first time) — pass-through to Bridge
//   Total to sender:  ~2.00% + flat + KYC if new
//
// Opción A (dynamic KYC check): we call Bridge to check if the customer already exists
// before building the quote. Bridge IS our database — zero-data policy respected.

import { findCustomerByEmail } from "@/providers/bridge/customers";

// ── Constants ────────────────────────────────────────────────────────────────

export const BRIDGE_ONRAMP_PCT  = 0.005;   // 0.50%
export const BRIDGE_OFFRAMP_PCT = 0.0025;  // 0.25%
export const BRIDGE_TOTAL_PCT   = BRIDGE_ONRAMP_PCT + BRIDGE_OFFRAMP_PCT; // 0.75%

export const OMNIPAY_SERVICE_PCT  = 0.0125; // 1.25%
export const OMNIPAY_FLAT_P2P     = 0.99;
export const OMNIPAY_FLAT_B2B     = 1.99;
export const OMNIPAY_MIN_FEE_P2P  = 3.99;  // minimum service fee P2P
export const OMNIPAY_MIN_FEE_B2B  = 4.99;  // minimum service fee B2B

export const KYC_FEE_P2P = 2.00;   // Bridge one-time KYC
export const KYB_FEE_B2B = 10.00;  // Bridge one-time KYB

// ── Types ────────────────────────────────────────────────────────────────────

export interface FeeQuote {
  amount_principal:   number;
  bridge_onramp:      number;
  bridge_offramp:     number;
  bridge_total:       number;
  omnipay_service:    number;
  omnipay_flat:       number;
  kyc_surcharge:      number;
  is_new_customer:    boolean;
  total_sender_pays:  number;
  omnipay_net_revenue: number;
  bridge_cost:        number;
}

// ── Static quote (no KYC check) — used server-side when email not yet known ──

export function calcStaticQuote(
  amount: number,
  type:   "p2p" | "b2b",
  isNew:  boolean = true,
): FeeQuote {
  const flatFee   = type === "b2b" ? OMNIPAY_FLAT_B2B : OMNIPAY_FLAT_P2P;
  const minFee    = type === "b2b" ? OMNIPAY_MIN_FEE_B2B : OMNIPAY_MIN_FEE_P2P;
  const kycFee    = isNew ? (type === "b2b" ? KYB_FEE_B2B : KYC_FEE_P2P) : 0;

  const bridgeOnramp  = parseFloat((amount * BRIDGE_ONRAMP_PCT).toFixed(2));
  const bridgeOfframp = parseFloat((amount * BRIDGE_OFFRAMP_PCT).toFixed(2));
  const bridgeTotal   = bridgeOnramp + bridgeOfframp;

  const serviceRaw     = amount * OMNIPAY_SERVICE_PCT;
  const omnipayService = parseFloat(Math.max(serviceRaw, minFee).toFixed(2));
  const omnipayFlat    = flatFee;
  const omnipayRev     = parseFloat((omnipayService + omnipayFlat).toFixed(2));

  const total = parseFloat((amount + bridgeTotal + omnipayRev + kycFee).toFixed(2));

  return {
    amount_principal:   amount,
    bridge_onramp:      bridgeOnramp,
    bridge_offramp:     bridgeOfframp,
    bridge_total:       bridgeTotal,
    omnipay_service:    omnipayService,
    omnipay_flat:       omnipayFlat,
    kyc_surcharge:      kycFee,
    is_new_customer:    isNew,
    total_sender_pays:  total,
    omnipay_net_revenue: omnipayRev,
    bridge_cost:        bridgeTotal,
  };
}

// ── Dynamic quote (Opción A) — checks Bridge for existing KYC status ─────────

export async function buildDynamicQuote(params: {
  amount: number;
  email:  string;
  type:   "p2p" | "b2b";
}): Promise<FeeQuote> {
  const { amount, email, type } = params;

  // Bridge is our DB — check if KYC already done
  const existing   = await findCustomerByEmail(email);
  const kycApproved = type === "b2b"
    ? existing?.kyb_status === "approved"
    : existing?.kyc_status === "approved";
  const isNew = !kycApproved;

  return calcStaticQuote(amount, type, isNew);
}
