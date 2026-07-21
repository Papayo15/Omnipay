// Route utilities — Bridge-only architecture
// selectP2PRail and Bitso-specific logic removed.
// Only getTargetCurrency() remains, used across API routes and providers.

// Returns the local fiat currency for a given 2-letter country code.
export function getTargetCurrency(targetCountry: string): string {
  const map: Record<string, string> = {
    MX: "MXN", BR: "BRL", CO: "COP", AR: "ARS",
    US: "USD", CA: "CAD", GB: "GBP",
    DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR",
    BE: "EUR", AT: "EUR", IE: "EUR", EU: "EUR",
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
