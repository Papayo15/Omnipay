export type Rail =
  | "stripe"       // MX, US, CA, EU, AU, LATAM → Stripe Canada (Visa Direct + Connect)
  | "airwallex"    // CN, HK, TW, MY, TH, PH, ID, JP, KR, VN → Airwallex
  | "flutterwave"  // NG, GH, KE, TZ, UG, ZA, SN, CI, CM → Flutterwave (M-Pesa, USSD, bank)
  | "stablecoin"   // RU, VE, PK, EG, TR → Binance Pay (currency control / sanctions)
  | "mercuryo"     // reservado
  // ── Fase 2 reservados ──
  | "belvo" | "plaid" | "tink" | "alipay" | "sbp" | "dlocalgo";

export const AIRWALLEX_COUNTRIES = new Set([
  "CN","HK","TW","MY","TH","PH","ID","JP","KR","VN",
]);

// Africa — Flutterwave handles M-Pesa, mobile money, local banks
export const FLUTTERWAVE_COUNTRIES = new Set([
  "NG","GH","KE","TZ","UG","ZA","SN","CI","CM","RW","ET","EG",
]);

// Sanctioned / currency-controlled — Binance Pay bridge
export const STABLECOIN_COUNTRIES = new Set([
  "RU","VE","PK","TR","IR","SY","CU",
]);

const RAIL_MAP: Record<string, Rail> = {
  // ── Stripe Canada — Visa Direct + Connect (zero float) ──
  US:"stripe", CA:"stripe", MX:"stripe", BR:"stripe",
  CO:"stripe", CL:"stripe", PE:"stripe", AR:"stripe",
  UY:"stripe", PY:"stripe", EC:"stripe",
  GB:"stripe", DE:"stripe", FR:"stripe", ES:"stripe", IT:"stripe",
  NL:"stripe", PT:"stripe", BE:"stripe", AT:"stripe", SE:"stripe",
  NO:"stripe", DK:"stripe", FI:"stripe", IE:"stripe", PL:"stripe",
  AU:"stripe", NZ:"stripe", IN:"stripe", SG:"stripe",
  BO:"stripe", GT:"stripe", SV:"stripe", HN:"stripe", CR:"stripe", DO:"stripe",
  // ── Airwallex — Asia Oriental ──
  CN:"airwallex", HK:"airwallex", TW:"airwallex",
  MY:"airwallex", TH:"airwallex", PH:"airwallex",
  ID:"airwallex", JP:"airwallex", KR:"airwallex", VN:"airwallex",
  // ── Flutterwave — África ──
  NG:"flutterwave", GH:"flutterwave", KE:"flutterwave",
  TZ:"flutterwave", UG:"flutterwave", ZA:"flutterwave",
  SN:"flutterwave", CI:"flutterwave", CM:"flutterwave",
  RW:"flutterwave", ET:"flutterwave", EG:"flutterwave",
  // ── Stablecoin (Binance Pay) — sanciones / control cambiario ──
  RU:"stablecoin", VE:"stablecoin", PK:"stablecoin",
  TR:"stablecoin", IR:"stablecoin", SY:"stablecoin", CU:"stablecoin",
};

export function selectRail(country: string): Rail {
  return RAIL_MAP[country.toUpperCase()] ?? "stripe";
}

export function selectRailByTransactionType(
  _type: "terminal" | "remesa" | "importacion" | string | null,
  country?: string,
  bankToken?: string
): Rail {
  const c      = (country ?? "").toUpperCase();
  const digits = (bankToken ?? "").replace(/\D/g, "");
  if (AIRWALLEX_COUNTRIES.has(c)) return "airwallex";
  if (FLUTTERWAVE_COUNTRIES.has(c) && digits.length !== 16) return "flutterwave";
  if (STABLECOIN_COUNTRIES.has(c) && digits.length !== 16)  return "stablecoin";
  return "stripe"; // tarjeta 16 dígitos siempre va a Stripe en cualquier país
}

export const RAIL_LABELS: Record<Rail, string> = {
  stripe:       "Stripe Canada (Visa Direct + Connect)",
  airwallex:    "Airwallex (Asia Oriental)",
  flutterwave:  "Flutterwave (África)",
  stablecoin:   "Binance Pay (Ruta Directa)",
  mercuryo:     "Mercuryo",
  belvo:        "SPEI / PIX",
  plaid:        "RTP / FedNow",
  tink:         "SEPA Instant",
  alipay:       "Alipay+ / UnionPay",
  sbp:          "SBP (Rusia)",
  dlocalgo:     "Transferencia Directa",
};
