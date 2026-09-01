// Whole-order provider routing — P2P and B2B alike.
//
// Architecture decision: no cross-provider on-chain bridging (Bridge USDC →
// Alchemy Pay deposit address). Bridge's account only has its own native fiat
// rails enabled, not outbound transfers to external addresses. Instead, each
// order is routed end-to-end through exactly ONE provider, chosen by the
// recipient's country:
//   - Bridge:      countries with a native Bridge rail (see NATIVE_RAILS)
//   - Alchemy Pay: everything else — handles its own on-ramp AND off-ramp,
//                  so no funds ever have to move between providers.

import { NATIVE_RAILS } from "@/providers/bridge/liquidation";

export type FundingProvider = "bridge" | "alchemypay";

export function selectFundingProvider(country: string): FundingProvider {
  return NATIVE_RAILS[country.toUpperCase()] ? "bridge" : "alchemypay";
}
