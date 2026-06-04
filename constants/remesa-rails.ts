// Selección de riel para remesas — cobertura global
// OmniPay no toca el dinero — delega a infraestructura licenciada con MSB en 130+ países

export type RemesaRail = "airwallex" | "thunes" | "p2p_pending";

// ── Airwallex — USA, Canadá, Europa, LATAM, Pacífico, Medio Oriente, Asia Central
const AIRWALLEX_COUNTRIES = new Set([
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
]);

// ── Thunes — Asia del Sur/SE + África (wallets móviles: M-Pesa, GCash, UPI, bKash…)
const THUNES_COUNTRIES = new Set([
  // Asia del Sur
  "IN","PK","BD","LK","NP",
  // Sudeste Asiático
  "PH","ID","VN","TH","MY","MM",
  // África del Este
  "KE","TZ","UG","RW","ET","ZM","MZ","ZW",
  // África del Oeste
  "NG","GH","SN","CI","CM","BF","ML",
  // África del Norte
  "EG","MA","TN","DZ",
  // Sudáfrica
  "ZA",
  // Oriente Medio (no cubierto por Airwallex)
  "LB",
  // Asia ampliada
  "CN",
]);

// ── p2p_pending — Países con restricciones OFAC (Bridge.xyz es empresa US — no puede operar)
// TODO: integrar procesador P2P no-OFAC (Telegram Pay API, corredores locales crypto-fiat)
const P2P_PENDING = new Set([
  "RU","IR","BY","SY","CU",
  // VE y TR sí pueden usar Airwallex/Thunes dependiendo del corredor — mover aquí si se bloquean
]);

export function selectRemesaRail(targetCountry: string): RemesaRail {
  const c = targetCountry.toUpperCase();
  if (P2P_PENDING.has(c))     return "p2p_pending";
  if (THUNES_COUNTRIES.has(c)) return "thunes";
  if (AIRWALLEX_COUNTRIES.has(c)) return "airwallex";
  return "airwallex"; // fallback — Airwallex tiene cobertura global como base
}

export const RAIL_NAMES: Record<RemesaRail, string> = {
  airwallex:   "Airwallex",
  thunes:      "Thunes",
  p2p_pending: "Próximamente",
};

export const RAIL_ETA: Record<RemesaRail, string> = {
  airwallex:   "Instantáneo – 2 horas",
  thunes:      "Minutos – 24 horas",
  p2p_pending: "No disponible",
};

export const RAIL_COVERAGE_NOTE: Record<RemesaRail, string> = {
  airwallex:   "Visa Direct OCT + banco local",
  thunes:      "M-Pesa · GCash · UPI · bKash · MTN · 130+ países",
  p2p_pending: "Servicio en construcción para esta región",
};
