export interface BankInfo {
  id: string;
  name: string;
  logo: string;
  country: string;
  routing?: string;      // USA: Routing Number
  bic?: string;          // Europa: BIC/SWIFT
  clabe_prefix?: string; // MX: primeros 3 dígitos de CLABE
  bin?: string[];        // Primeros 6 dígitos de tarjeta
  accountType: "clabe" | "account" | "iban" | "phone" | "card_or_clabe";
}

// ─── MÉXICO — Catálogo completo con BINs y prefijos CLABE ────────────────────
export const MX_BANKS: BankInfo[] = [
  // Neo-bancos y Fintechs
  { id: "nu",          name: "Nu México",           logo: "💜", country: "MX", clabe_prefix: "638", bin: ["491503","491504","491505","491506","491507","491508","491509","491510"], accountType: "card_or_clabe" },
  { id: "spin",        name: "Spin by OXXO",        logo: "🟢", country: "MX", clabe_prefix: "646", bin: ["531694","531695","531696","539367","539368","539369"], accountType: "card_or_clabe" },
  { id: "bienestar",   name: "Banco del Bienestar", logo: "🏛️",  country: "MX", clabe_prefix: "145", bin: ["417399","417400","417401","417402"], accountType: "card_or_clabe" },
  { id: "mercadopago", name: "Mercado Pago",        logo: "🔵", country: "MX", clabe_prefix: "722", bin: ["510229","510230","510231","559995","559996"], accountType: "card_or_clabe" },
  { id: "openbank",    name: "Openbank",            logo: "🟦", country: "MX", clabe_prefix: "706", bin: ["490756","490757"], accountType: "card_or_clabe" },
  { id: "hey",         name: "Hey Banco",           logo: "🟠", country: "MX", clabe_prefix: "058", bin: ["456025","456026"], accountType: "card_or_clabe" },
  { id: "cuenca",      name: "Cuenca",              logo: "🟣", country: "MX", clabe_prefix: "723", bin: ["490757","490758"], accountType: "card_or_clabe" },
  { id: "klar",        name: "Klar",                logo: "🔷", country: "MX", clabe_prefix: "659", bin: ["531682","531683"], accountType: "card_or_clabe" },
  { id: "stori",       name: "Stori",               logo: "🟡", country: "MX", clabe_prefix: "706", bin: ["549270","549271","549272"], accountType: "card_or_clabe" },
  // Bancos tradicionales
  { id: "bbva_mx",     name: "BBVA México",         logo: "🔵", country: "MX", clabe_prefix: "012", bin: ["426617","485332","411069","432368","490528","491287","530119","544784","547193","557806","400069","457618","432367"], accountType: "card_or_clabe" },
  { id: "banamex",     name: "Citibanamex",         logo: "🔴", country: "MX", clabe_prefix: "002", bin: ["400011","401183","426675","432619","456775","487018","510303","511815","514256","517561","524069","527417","540753","553673","559985"], accountType: "card_or_clabe" },
  { id: "santander",   name: "Santander",           logo: "🌹", country: "MX", clabe_prefix: "014", bin: ["421741","457616","542912","400785","414884","432364","432370","456797","486694","500430","519735","528005","548237","557474"], accountType: "card_or_clabe" },
  { id: "banorte",     name: "Banorte",             logo: "🟠", country: "MX", clabe_prefix: "072", bin: ["421519","451810","456884","400022","400149","427514","432366","432369","432371","456883","486697","531579","551282","558673"], accountType: "card_or_clabe" },
  { id: "hsbc_mx",     name: "HSBC México",         logo: "🔺", country: "MX", clabe_prefix: "021", bin: ["421813","456381","521553","400439","427066","432365","432372","456380","486696","531578","548236","558672","559984"], accountType: "card_or_clabe" },
  { id: "scotiabank",  name: "Scotiabank",          logo: "🟡", country: "MX", clabe_prefix: "044", bin: ["426603","434549","400440","432363","432373","456799","457617","521554","548238","558674"], accountType: "card_or_clabe" },
  { id: "inbursa",     name: "Inbursa",             logo: "🟡", country: "MX", clabe_prefix: "036", bin: ["402600","426600","400441","432362","456800","521555","548239"], accountType: "card_or_clabe" },
  { id: "multiva",     name: "Multiva",             logo: "🟤", country: "MX", clabe_prefix: "058", bin: ["456026","432361","456801","521556"], accountType: "card_or_clabe" },
  { id: "bajio",       name: "Banco del Bajío",     logo: "🟢", country: "MX", clabe_prefix: "030", bin: ["432360","456802","521557","548240"], accountType: "card_or_clabe" },
  { id: "afirme",      name: "Afirme",              logo: "🔵", country: "MX", clabe_prefix: "062", bin: ["432359","456803","521558"], accountType: "card_or_clabe" },
  { id: "azteca",      name: "Banco Azteca",        logo: "🟠", country: "MX", clabe_prefix: "127", bin: ["432358","456804","521559","548241"], accountType: "card_or_clabe" },
  { id: "famsa",       name: "Banca Afirme/Famsa",  logo: "🔵", country: "MX", clabe_prefix: "062", bin: ["432357","456805"], accountType: "card_or_clabe" },
  { id: "stp",         name: "STP (otras Fintechs)","logo": "⚡", country: "MX", clabe_prefix: "646", accountType: "card_or_clabe" },
  { id: "other_mx",    name: "Otro banco / institución", logo: "🏦", country: "MX", accountType: "card_or_clabe" },
];

// ─── USA ─────────────────────────────────────────────────────────────────────
export const US_BANKS: BankInfo[] = [
  { id: "chase",       name: "Chase",              logo: "🏦", country: "US", routing: "021000021", accountType: "account" },
  { id: "boa",         name: "Bank of America",    logo: "🏦", country: "US", routing: "026009593", accountType: "account" },
  { id: "wells",       name: "Wells Fargo",        logo: "🏦", country: "US", routing: "121000248", accountType: "account" },
  { id: "citi_us",     name: "Citibank",           logo: "🏦", country: "US", routing: "021000089", accountType: "account" },
  { id: "usbank",      name: "US Bank",            logo: "🏦", country: "US", routing: "091000022", accountType: "account" },
  { id: "td",          name: "TD Bank",            logo: "🏦", country: "US", routing: "031101266", accountType: "account" },
  { id: "pnc",         name: "PNC Bank",           logo: "🏦", country: "US", routing: "043000096", accountType: "account" },
  { id: "capital_one", name: "Capital One",        logo: "🏦", country: "US", routing: "051405515", accountType: "account" },
  { id: "truist",      name: "Truist",             logo: "🏦", country: "US", routing: "053101121", accountType: "account" },
  { id: "ally",        name: "Ally Bank",          logo: "🟣", country: "US", routing: "124003116", accountType: "account" },
  { id: "chime",       name: "Chime",              logo: "🟢", country: "US", routing: "101205681", accountType: "account" },
  { id: "cashapp",     name: "Cash App",           logo: "🟢", country: "US", routing: "121201694", accountType: "account" },
  { id: "venmo",       name: "Venmo",              logo: "🔵", country: "US", routing: "021000021", accountType: "account" },
  { id: "other_us",    name: "Otro banco",         logo: "🏦", country: "US", accountType: "account" },
];

// ─── Brasil ──────────────────────────────────────────────────────────────────
export const BR_BANKS: BankInfo[] = [
  { id: "nubank",      name: "Nubank",             logo: "💜", country: "BR", accountType: "account" },
  { id: "itau",        name: "Itaú",               logo: "🟠", country: "BR", accountType: "account" },
  { id: "bradesco",    name: "Bradesco",           logo: "🔴", country: "BR", accountType: "account" },
  { id: "caixa",       name: "Caixa Econômica",    logo: "🟦", country: "BR", accountType: "account" },
  { id: "bb",          name: "Banco do Brasil",    logo: "🟡", country: "BR", accountType: "account" },
  { id: "inter",       name: "Banco Inter",        logo: "🟠", country: "BR", accountType: "account" },
  { id: "c6",          name: "C6 Bank",            logo: "⚫", country: "BR", accountType: "account" },
  { id: "other_br",    name: "Outro banco",        logo: "🏦", country: "BR", accountType: "account" },
];

// ─── Europa ───────────────────────────────────────────────────────────────────
export const EU_BANKS: Record<string, BankInfo[]> = {
  GB: [
    { id: "barclays",    name: "Barclays",          logo: "🦅", country: "GB", bic: "BUKBGB22", accountType: "iban" },
    { id: "hsbc_gb",     name: "HSBC UK",           logo: "🔺", country: "GB", bic: "HBUKGB4B", accountType: "iban" },
    { id: "lloyds",      name: "Lloyds",            logo: "🐎", country: "GB", bic: "LOYDGB21", accountType: "iban" },
    { id: "natwest",     name: "NatWest",           logo: "🟣", country: "GB", bic: "NWBKGB2L", accountType: "iban" },
    { id: "monzo",       name: "Monzo",             logo: "🟠", country: "GB", bic: "MONZGB2L", accountType: "iban" },
    { id: "revolut_gb",  name: "Revolut",           logo: "⚪", country: "GB", bic: "REVOGB21", accountType: "iban" },
    { id: "other_gb",    name: "Other bank",        logo: "🏦", country: "GB", accountType: "iban" },
  ],
  DE: [
    { id: "deutsche",    name: "Deutsche Bank",     logo: "🔷", country: "DE", bic: "DEUTDEDB", accountType: "iban" },
    { id: "commerzbank", name: "Commerzbank",       logo: "🟡", country: "DE", bic: "COBADEFFXXX", accountType: "iban" },
    { id: "sparkasse",   name: "Sparkasse",         logo: "🔴", country: "DE", bic: "SSKMDEMM", accountType: "iban" },
    { id: "n26",         name: "N26",               logo: "⚫", country: "DE", bic: "NTSBDEB1", accountType: "iban" },
    { id: "ing_de",      name: "ING",               logo: "🟠", country: "DE", bic: "INGDDEFFXXX", accountType: "iban" },
    { id: "other_de",    name: "Otro banco",        logo: "🏦", country: "DE", accountType: "iban" },
  ],
  ES: [
    { id: "santander_es",name: "Santander",         logo: "🌹", country: "ES", bic: "BSCHESMM", accountType: "iban" },
    { id: "bbva_es",     name: "BBVA",              logo: "🔵", country: "ES", bic: "BBVAESMMXXX", accountType: "iban" },
    { id: "caixabank",   name: "CaixaBank",         logo: "⭐", country: "ES", bic: "CAIXESBBXXX", accountType: "iban" },
    { id: "openbank_es", name: "Openbank",          logo: "🟦", country: "ES", bic: "OPENESMMXXX", accountType: "iban" },
    { id: "revolut_es",  name: "Revolut",           logo: "⚪", country: "ES", bic: "REVOGB21", accountType: "iban" },
    { id: "other_es",    name: "Otro banco",        logo: "🏦", country: "ES", accountType: "iban" },
  ],
  FR: [
    { id: "bnp",         name: "BNP Paribas",       logo: "🟢", country: "FR", bic: "BNPAFRPPXXX", accountType: "iban" },
    { id: "sg",          name: "Société Générale",  logo: "🔴", country: "FR", bic: "SOGEFRPPXXX", accountType: "iban" },
    { id: "ca",          name: "Crédit Agricole",   logo: "🟢", country: "FR", bic: "AGRIFRPPXXX", accountType: "iban" },
    { id: "boursobank",  name: "BoursoBank",        logo: "🔵", country: "FR", bic: "BOUSFRPPXXX", accountType: "iban" },
    { id: "other_fr",    name: "Autre banque",      logo: "🏦", country: "FR", accountType: "iban" },
  ],
  IT: [
    { id: "intesa",      name: "Intesa Sanpaolo",   logo: "🟦", country: "IT", bic: "BCITITMM", accountType: "iban" },
    { id: "unicredit",   name: "UniCredit",         logo: "🔴", country: "IT", bic: "UNCRITMMXXX", accountType: "iban" },
    { id: "fineco",      name: "Fineco",            logo: "🟠", country: "IT", bic: "FINEITMM", accountType: "iban" },
    { id: "other_it",    name: "Altra banca",       logo: "🏦", country: "IT", accountType: "iban" },
  ],
};

// ─── Asia ─────────────────────────────────────────────────────────────────────
export const ASIA_BANKS: Record<string, BankInfo[]> = {
  CN: [
    { id: "alipay_cn",   name: "Alipay",            logo: "🔵", country: "CN", accountType: "phone" },
    { id: "wechatpay",   name: "WeChat Pay",        logo: "🟢", country: "CN", accountType: "phone" },
    { id: "unionpay",    name: "UnionPay",          logo: "🔴", country: "CN", accountType: "account" },
    { id: "icbc",        name: "ICBC",              logo: "🔴", country: "CN", accountType: "phone" },
    { id: "ccb",         name: "China Construction",logo: "🔵", country: "CN", accountType: "phone" },
    { id: "other_cn",    name: "Otro banco",        logo: "🏦", country: "CN", accountType: "phone" },
  ],
  RU: [
    { id: "sber",        name: "Sberbank",          logo: "🟢", country: "RU", accountType: "phone" },
    { id: "tinkoff",     name: "T-Bank (Tinkoff)",  logo: "🟡", country: "RU", accountType: "phone" },
    { id: "vtb",         name: "VTB",               logo: "🔵", country: "RU", accountType: "phone" },
    { id: "alfa",        name: "Alfa-Bank",         logo: "🔴", country: "RU", accountType: "phone" },
    { id: "raiffeisen",  name: "Raiffeisen RU",     logo: "🟡", country: "RU", accountType: "phone" },
    { id: "other_ru",    name: "Otro banco",        logo: "🏦", country: "RU", accountType: "phone" },
  ],
  SG: [
    { id: "dbs",         name: "DBS/POSB",          logo: "🔴", country: "SG", accountType: "account" },
    { id: "ocbc",        name: "OCBC",              logo: "🔴", country: "SG", accountType: "account" },
    { id: "uob",         name: "UOB",               logo: "🔵", country: "SG", accountType: "account" },
    { id: "other_sg",    name: "Other bank",        logo: "🏦", country: "SG", accountType: "account" },
  ],
};

// ─── LATAM sin Open Banking ───────────────────────────────────────────────────
export const LATAM_BANKS: Record<string, BankInfo[]> = {
  AR: [
    { id: "mercadopago_ar", name: "Mercado Pago",    logo: "🔵", country: "AR", accountType: "account" },
    { id: "uala",           name: "Uala",            logo: "🟣", country: "AR", accountType: "account" },
    { id: "galicia",        name: "Banco Galicia",   logo: "🔴", country: "AR", accountType: "account" },
    { id: "nacion",         name: "Banco Nación",   logo: "🟦", country: "AR", accountType: "account" },
    { id: "bbva_ar",        name: "BBVA Argentina",  logo: "🔵", country: "AR", accountType: "account" },
    { id: "santander_ar",   name: "Santander",       logo: "🌹", country: "AR", accountType: "account" },
    { id: "other_ar",       name: "Otro banco",      logo: "🏦", country: "AR", accountType: "account" },
  ],
  CO: [
    { id: "nequi",          name: "Nequi",           logo: "🟣", country: "CO", accountType: "account" },
    { id: "daviplata",      name: "Daviplata",       logo: "🔴", country: "CO", accountType: "phone" },
    { id: "bancolombia",    name: "Bancolombia",     logo: "🟡", country: "CO", accountType: "account" },
    { id: "davivienda",     name: "Davivienda",      logo: "🔴", country: "CO", accountType: "account" },
    { id: "other_co",       name: "Otro banco",      logo: "🏦", country: "CO", accountType: "account" },
  ],
  PE: [
    { id: "yape",           name: "Yape",            logo: "🟣", country: "PE", accountType: "phone" },
    { id: "plin",           name: "Plin",            logo: "🔵", country: "PE", accountType: "phone" },
    { id: "bcp",            name: "BCP",             logo: "🟦", country: "PE", accountType: "account" },
    { id: "interbank",      name: "Interbank",       logo: "🟢", country: "PE", accountType: "account" },
    { id: "other_pe",       name: "Otro banco",      logo: "🏦", country: "PE", accountType: "account" },
  ],
  CL: [
    { id: "mach",           name: "Mach",            logo: "🟣", country: "CL", accountType: "account" },
    { id: "mercadopago_cl", name: "Mercado Pago",    logo: "🔵", country: "CL", accountType: "account" },
    { id: "bci",            name: "BCI",             logo: "🔵", country: "CL", accountType: "account" },
    { id: "bancochile",     name: "Banco de Chile",  logo: "🔴", country: "CL", accountType: "account" },
    { id: "santander_cl",   name: "Santander Chile", logo: "🌹", country: "CL", accountType: "account" },
    { id: "bice",           name: "Banco BICE",      logo: "🟦", country: "CL", accountType: "account" },
    { id: "scotiabank_cl",  name: "Scotiabank CL",   logo: "🟡", country: "CL", accountType: "account" },
    { id: "other_cl",       name: "Otro banco",      logo: "🏦", country: "CL", accountType: "account" },
  ],
};

// ─── Catálogo unificado ───────────────────────────────────────────────────────
export const BANKS_BY_COUNTRY: Record<string, BankInfo[]> = {
  MX: MX_BANKS,
  US: US_BANKS,
  BR: BR_BANKS,
  CA: [
    { id: "rbc",    name: "RBC",          logo: "🔵", country: "CA", routing: "003", accountType: "account" },
    { id: "td_ca",  name: "TD Canada",   logo: "🟢", country: "CA", routing: "004", accountType: "account" },
    { id: "bmo",    name: "BMO",          logo: "🔵", country: "CA", routing: "001", accountType: "account" },
    { id: "scotiabank_ca", name: "Scotiabank CA", logo: "🟡", country: "CA", routing: "002", accountType: "account" },
    { id: "other_ca", name: "Other bank", logo: "🏦", country: "CA", accountType: "account" },
  ],
  ...EU_BANKS,
  ...ASIA_BANKS,
  ...LATAM_BANKS,
  // Países stablecoin bridge
  VE: [
    { id: "banesco",    name: "Banesco",             logo: "🟦", country: "VE", accountType: "account" },
    { id: "mercantil",  name: "Banco Mercantil",     logo: "🔵", country: "VE", accountType: "account" },
    { id: "venezuela",  name: "Banco de Venezuela",  logo: "🔴", country: "VE", accountType: "account" },
    { id: "other_ve",   name: "Otro banco",          logo: "🏦", country: "VE", accountType: "account" },
  ],
  PK: [
    { id: "easypaisa",  name: "Easypaisa",           logo: "🟢", country: "PK", accountType: "phone" },
    { id: "jazzcash",   name: "JazzCash",            logo: "🔴", country: "PK", accountType: "phone" },
    { id: "hbl",        name: "HBL",                 logo: "🟢", country: "PK", accountType: "iban" },
    { id: "ubl",        name: "UBL",                 logo: "🔵", country: "PK", accountType: "iban" },
    { id: "mcb",        name: "MCB Bank",            logo: "🟦", country: "PK", accountType: "iban" },
    { id: "other_pk",   name: "Other bank",          logo: "🏦", country: "PK", accountType: "iban" },
  ],
  NG: [
    { id: "access",  name: "Access Bank",  logo: "🔵", country: "NG", accountType: "account" },
    { id: "gtbank",  name: "GTBank",       logo: "🟠", country: "NG", accountType: "account" },
    { id: "zenith",  name: "Zenith Bank",  logo: "🔵", country: "NG", accountType: "account" },
    { id: "other_ng",name: "Other bank",  logo: "🏦", country: "NG", accountType: "account" },
  ],
  IN: [
    { id: "paytm",   name: "Paytm",        logo: "🔵", country: "IN", accountType: "phone" },
    { id: "phonepe", name: "PhonePe",      logo: "🟣", country: "IN", accountType: "phone" },
    { id: "gpay_in", name: "Google Pay",   logo: "🟢", country: "IN", accountType: "phone" },
    { id: "sbi",     name: "SBI",          logo: "🔵", country: "IN", accountType: "phone" },
    { id: "hdfc",    name: "HDFC Bank",    logo: "🔵", country: "IN", accountType: "phone" },
    { id: "other_in",name: "Other bank",  logo: "🏦", country: "IN", accountType: "phone" },
  ],
};

// ─── Motor de detección inteligente ──────────────────────────────────────────

// Detecta banco MX por BIN (primeros 6 dígitos de tarjeta de débito)
export function detectBankByBIN(input: string): BankInfo | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const bin6 = digits.slice(0, 6);
  const bin4 = digits.slice(0, 4);
  return (
    MX_BANKS.find((b) =>
      b.bin?.some((prefix) => bin6.startsWith(prefix) || bin4.startsWith(prefix))
    ) ?? null
  );
}

// Detecta banco MX por prefijo CLABE (primeros 3 dígitos)
export function detectBankByCLABE(clabe: string): BankInfo | null {
  const digits = clabe.replace(/\D/g, "");
  if (digits.length < 3) return null;
  const prefix = digits.slice(0, 3);
  return MX_BANKS.find((b) => b.clabe_prefix === prefix) ?? null;
}

// Detección inteligente: decide si es tarjeta (16d) o CLABE (18d) y detecta el banco
export function smartDetectMX(input: string): { bank: BankInfo | null; inputType: "card" | "clabe" | "partial" | "unknown" } {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return { bank: null, inputType: "unknown" };
  if (digits.length <= 6) return { bank: detectBankByBIN(digits), inputType: "partial" };
  if (digits.length === 16) {
    return { bank: detectBankByBIN(digits), inputType: "card" };
  }
  if (digits.length >= 17 && digits.length <= 18) {
    const byClabe = detectBankByCLABE(digits);
    const byBin = detectBankByBIN(digits);
    return { bank: byClabe ?? byBin, inputType: "clabe" };
  }
  return { bank: detectBankByBIN(digits) ?? detectBankByCLABE(digits), inputType: "partial" };
}

// Obtiene el routing number USA
export function getUSRouting(bankId: string): string | null {
  return US_BANKS.find((b) => b.id === bankId)?.routing ?? null;
}

// Input metadata según tipo de cuenta
export function getAccountInputMeta(accountType: BankInfo["accountType"]): { label: string; placeholder: string } {
  switch (accountType) {
    case "clabe":        return { label: "CLABE Interbancaria", placeholder: "18 dígitos" };
    case "card_or_clabe":return { label: "Tarjeta o CLABE", placeholder: "16 dígitos (tarjeta) ó 18 (CLABE)" };
    case "iban":         return { label: "Número IBAN", placeholder: "Ej: ES00 0000 0000..." };
    case "phone":        return { label: "Número de celular", placeholder: "+..." };
    case "account": default: return { label: "Número de cuenta", placeholder: "Número de cuenta" };
  }
}
