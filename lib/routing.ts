// P2P Rail Selector
//
// Chooses between Bitso (LATAM primary) and Wise (global + emergency fallback).
// Wise B2B uses the SAME credentials as OmniPay B2B — WISE_API_KEY + WISE_PROFILE_ID.

export type P2PRail = "bitso" | "wise";

// Countries Bitso Business can settle directly (USDC → local fiat → instant local rail)
const BITSO_COUNTRIES = new Set(["MX", "BR", "CO", "AR"]);

// Local settlement method per Bitso country
export const BITSO_LOCAL_RAIL: Record<string, string> = {
  MX: "SPEI",
  BR: "PIX",
  CO: "PSE",
  AR: "CBU",
};

export function selectP2PRail(targetCountry: string): P2PRail {
  const country = targetCountry.toUpperCase();
  return BITSO_COUNTRIES.has(country) && !!process.env.BITSO_API_KEY
    ? "bitso"
    : "wise";
}

export function isBitsoCountry(targetCountry: string): boolean {
  return BITSO_COUNTRIES.has(targetCountry.toUpperCase());
}

// Returns the target currency for a given country (used for Wise quotes)
export function getTargetCurrency(targetCountry: string): string {
  const map: Record<string, string> = {
    MX: "MXN", BR: "BRL", CO: "COP", AR: "ARS",
    US: "USD", CA: "CAD", GB: "GBP", EU: "EUR",
    DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR",
    IN: "INR", PH: "PHP", NG: "NGN", KE: "KES", GH: "GHS",
    AU: "AUD", JP: "JPY", KR: "KRW", VN: "VND", ID: "IDR",
    MA: "MAD", EG: "EGP", ZA: "ZAR", SN: "XOF", CI: "XOF",
    TZ: "TZS", UG: "UGX", ZM: "ZMW", ET: "ETB", RW: "RWF",
    PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
    TR: "TRY", SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD",
    TH: "THB", MY: "MYR", SG: "SGD", PL: "PLN", UA: "UAH",
    CL: "CLP", PE: "PEN", EC: "USD", DO: "DOP", GT: "GTQ",
    HN: "HNL", SV: "USD", CR: "CRC", PA: "USD", BO: "BOB",
    PY: "PYG", UY: "UYU",
  };
  return map[targetCountry.toUpperCase()] ?? "USD";
}
