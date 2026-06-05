// Selección de riel para remesas — cobertura global
// Cobro: siempre Stripe. Dispersión: Wise (cuentas bancarias) o Thunes (wallets móviles/China).

export type RemesaRail = "wise" | "thunes" | "p2p_pending";

// ── Wise — cuentas bancarias en 170+ países
const WISE_COUNTRIES = new Set([
  // Norteamérica
  "US","CA","MX",
  // LATAM
  "BR","CO","CL","PE","AR","UY","PY","EC","BO","GT","SV","HN","CR","DO","PA","JM",
  // Europa Occidental
  "GB","DE","FR","ES","IT","NL","PT","BE","AT","SE","NO","DK","FI","IE","PL","CH",
  // Europa del Este
  "RO","HU","CZ","UA","GR","SK","HR","BG",
  // Pacífico
  "AU","NZ","SG","JP","KR","HK","TW",
  // Medio Oriente
  "AE","SA","QA","KW","BH","OM","JO","IL","TR",
  // Asia Central
  "KZ","UZ","GE","AM","AZ",
  // Asia del Sur (cuentas bancarias — UPI/IMPS)
  "IN","LK","NP",
  // Sudeste Asiático (cuentas bancarias)
  "VN","TH","MY","ID",
  // África bancarizada
  "KE","NG","GH","ZA","EG","MA","TN","DZ","RW","UG",
]);

// ── Thunes — wallets móviles, China, corredores sin cobertura Wise
const THUNES_COUNTRIES = new Set([
  // China
  "CN",
  // Asia del Sur (wallets: bKash, JazzCash)
  "PK","BD",
  // Sudeste Asiático (wallets: GCash, GoPay, Momo)
  "PH","MM",
  // África del Este (M-Pesa TZ/ZM/MZ)
  "TZ","ZM","MZ","ZW","ET",
  // África del Oeste (wallets: MTN, Orange Money, Wave)
  "SN","CI","CM","BF","ML",
  // África del Sur (Airtel)
  "MW",
  // Oriente Medio (wallets locales)
  "LB",
]);

// ── p2p_pending — restricciones OFAC / sin proveedor habilitado
const P2P_PENDING = new Set([
  "RU","IR","BY","SY","CU",
]);

export function selectRemesaRail(targetCountry: string): RemesaRail {
  const c = targetCountry.toUpperCase();
  if (P2P_PENDING.has(c))   return "p2p_pending";
  if (THUNES_COUNTRIES.has(c)) return "thunes";
  if (WISE_COUNTRIES.has(c))   return "wise";
  return "wise"; // fallback — Wise tiene cobertura global como base
}

export const RAIL_NAMES: Record<RemesaRail, string> = {
  wise:        "Wise",
  thunes:      "Thunes",
  p2p_pending: "Próximamente",
};

export const RAIL_ETA: Record<RemesaRail, string> = {
  wise:        "1-2 días hábiles",
  thunes:      "Minutos – 24 horas",
  p2p_pending: "No disponible",
};

export const RAIL_COVERAGE_NOTE: Record<RemesaRail, string> = {
  wise:        "Cuenta bancaria · CLABE · IBAN · 170+ países",
  thunes:      "M-Pesa · GCash · WeChat · bKash · MTN · wallets locales",
  p2p_pending: "Servicio en construcción para esta región",
};
