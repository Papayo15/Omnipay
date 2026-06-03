// Rieles de pago activos — Arquitectura Canadá Hub
// Entrada:    Stripe Canada (checkout global)
// Dispersión: Visa Direct (push payout a tarjeta)
// Respaldo:   Wise Canadá (CAD/USD)
// Especiales: Airwallex (Asia), Binance Pay (mercados restringidos)

export type Rail =
  | "stripe"      // MX, US, CA, EU, AU, LATAM — Stripe Canada
  | "visa_direct" // Push payout a tarjeta Visa/MC (16 dígitos)
  | "wise"        // Respaldo CAD/USD + receptor de comisiones
  | "airwallex"   // Asia Oriental (CN, HK, TW, MY, TH, PH, ID, JP, KR, VN)
  | "binance_pay"; // Ruta especial — mercados restringidos / Rusia

export const AIRWALLEX_COUNTRIES = new Set([
  "CN","HK","TW","MY","TH","PH","ID","JP","KR","VN",
]);

export const BINANCE_PAY_COUNTRIES = new Set([
  "RU","VE","PK","TR","IR","SY","CU",
]);

// Africa — sin riel dedicado activo; usa Stripe con tarjeta o Airwallex para Asia
// Si se activa Flutterwave en el futuro, agregar rail "flutterwave" y su set aquí

const RAIL_MAP: Record<string, Rail> = {
  // ── Stripe Canada — entrada global ──
  US:"stripe", CA:"stripe", MX:"stripe", BR:"stripe",
  CO:"stripe", CL:"stripe", PE:"stripe", AR:"stripe",
  UY:"stripe", PY:"stripe", EC:"stripe", BO:"stripe",
  GT:"stripe", SV:"stripe", HN:"stripe", CR:"stripe", DO:"stripe",
  GB:"stripe", DE:"stripe", FR:"stripe", ES:"stripe", IT:"stripe",
  NL:"stripe", PT:"stripe", BE:"stripe", AT:"stripe", SE:"stripe",
  NO:"stripe", DK:"stripe", FI:"stripe", IE:"stripe", PL:"stripe",
  AU:"stripe", NZ:"stripe", IN:"stripe", SG:"stripe",
  NG:"stripe", GH:"stripe", KE:"stripe", ZA:"stripe",   // África → Stripe con tarjeta
  // ── Airwallex — Asia Oriental ──
  CN:"airwallex", HK:"airwallex", TW:"airwallex",
  MY:"airwallex", TH:"airwallex", PH:"airwallex",
  ID:"airwallex", JP:"airwallex", KR:"airwallex", VN:"airwallex",
  // ── Binance Pay — mercados restringidos ──
  RU:"binance_pay", VE:"binance_pay", PK:"binance_pay",
  TR:"binance_pay", IR:"binance_pay", SY:"binance_pay", CU:"binance_pay",
};

export function selectRail(country: string): Rail {
  return RAIL_MAP[country.toUpperCase()] ?? "stripe";
}

// Si el token es una tarjeta de 16 dígitos → siempre Visa Direct (vía Stripe)
export function selectRailByTransactionType(
  _type: "terminal" | "remesa" | "importacion" | string | null,
  country?: string,
  bankToken?: string
): Rail {
  const c      = (country ?? "").toUpperCase();
  const digits = (bankToken ?? "").replace(/\D/g, "");

  // Tarjeta 16 dígitos → Visa Direct en cualquier país
  if (digits.length === 16) return "visa_direct";

  if (AIRWALLEX_COUNTRIES.has(c)) return "airwallex";
  if (BINANCE_PAY_COUNTRIES.has(c)) return "binance_pay";

  return "stripe";
}

export const RAIL_LABELS: Record<Rail, string> = {
  stripe:       "Stripe Canada",
  visa_direct:  "Visa Direct (dispersión instantánea)",
  wise:         "Wise Canadá (respaldo CAD/USD)",
  airwallex:    "Airwallex (Asia Oriental)",
  binance_pay:  "Binance Pay (ruta especial)",
};
