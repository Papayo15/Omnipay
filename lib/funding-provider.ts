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

// Countries with no native Bridge rail — routed through Alchemy Pay instead.
// Shared by /p2p and /recibir-empresa (both P2P and B2B use the same routing).
// Shown by code, not translated name — country codes are identifiers like
// currency codes, not prose.
export const ALCHEMYPAY_COUNTRIES = [
  { code: "AU", currency: "AUD", flag: "🇦🇺" },
  { code: "NG", currency: "NGN", flag: "🇳🇬" },
  { code: "KE", currency: "KES", flag: "🇰🇪" },
  { code: "GH", currency: "GHS", flag: "🇬🇭" },
  { code: "IN", currency: "INR", flag: "🇮🇳" },
  { code: "PH", currency: "PHP", flag: "🇵🇭" },
  { code: "ID", currency: "IDR", flag: "🇮🇩" },
  { code: "VN", currency: "VND", flag: "🇻🇳" },
  { code: "TH", currency: "THB", flag: "🇹🇭" },
  { code: "MY", currency: "MYR", flag: "🇲🇾" },
  { code: "SG", currency: "SGD", flag: "🇸🇬" },
  { code: "JP", currency: "JPY", flag: "🇯🇵" },
  { code: "KR", currency: "KRW", flag: "🇰🇷" },
  { code: "PK", currency: "PKR", flag: "🇵🇰" },
  { code: "BD", currency: "BDT", flag: "🇧🇩" },
  { code: "ZA", currency: "ZAR", flag: "🇿🇦" },
  { code: "EG", currency: "EGP", flag: "🇪🇬" },
  { code: "MA", currency: "MAD", flag: "🇲🇦" },
  { code: "AE", currency: "AED", flag: "🇦🇪" },
  { code: "SA", currency: "SAR", flag: "🇸🇦" },
];
