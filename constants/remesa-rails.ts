// Selección de riel para remesas internacionales
// OmniPay no toca el dinero — delega a infraestructura licenciada

export type RemesaRail = "airwallex" | "thunes" | "bridge";

// Airwallex: USA, Canadá, Europa, LATAM
const AIRWALLEX_COUNTRIES = new Set([
  "US","CA","MX","BR","CO","CL","PE","AR","UY","PY","EC","BO","GT","SV","HN","CR","DO",
  "GB","DE","FR","ES","IT","NL","PT","BE","AT","SE","NO","DK","FI","IE","PL",
  "AU","NZ","SG",
]);

// Thunes: Asia + África (red de wallets móviles y bancaria)
const THUNES_COUNTRIES = new Set([
  "CN","IN","PH","ID","VN","TH","MY","KR","JP","HK","TW","PK","BD","LK","MM",
  "NG","GH","KE","TZ","ZA","UG","SN","CI","CM","RW","ET","EG","MA","TN",
]);

// Bridge.xyz: Rusia y mercados con restricciones de divisas (stablecoin bridge)
const BRIDGE_COUNTRIES = new Set([
  "RU","VE","TR","IR","BY","CU","SY",
]);

export function selectRemesaRail(targetCountry: string): RemesaRail {
  const c = targetCountry.toUpperCase();
  if (AIRWALLEX_COUNTRIES.has(c)) return "airwallex";
  if (THUNES_COUNTRIES.has(c))    return "thunes";
  if (BRIDGE_COUNTRIES.has(c))    return "bridge";
  return "airwallex"; // fallback: Airwallex tiene mayor cobertura global
}

export const RAIL_NAMES: Record<RemesaRail, string> = {
  airwallex: "Airwallex",
  thunes:    "Thunes",
  bridge:    "Bridge.xyz",
};

// Estimación de tiempo de llegada por riel
export const RAIL_ETA: Record<RemesaRail, string> = {
  airwallex: "Instantáneo – 2 horas",
  thunes:    "Minutos – 24 horas",
  bridge:    "2 – 24 horas",
};
