// CLABE (Clave Bancaria Estandarizada) — 18-digit Mexican bank account identifier
// Checksum algorithm: weighted sum mod 10, verified against last digit
// Bank detection: first 3 digits = bank code (BANXICO catalog)

const WEIGHTS = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];

export function validateClabe(clabe: string): boolean {
  const digits = clabe.replace(/\D/g, "");
  if (digits.length !== 18) return false;

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(digits[i]) * WEIGHTS[i];
  }
  const control = (10 - (sum % 10)) % 10;
  return control === parseInt(digits[17]);
}

export interface BankInfo {
  name:      string;
  shortName: string;
  color:     string;   // hex — for displaying a colored badge in UI
}

// BANXICO official bank catalog (codes 001–999)
// Source: BANXICO SPEI participant list
const BANK_MAP: Record<string, BankInfo> = {
  "002": { name: "Citibanamex",          shortName: "Banamex",       color: "#003087" },
  "006": { name: "Bancomext",            shortName: "Bancomext",     color: "#004F9F" },
  "009": { name: "Banobras",             shortName: "Banobras",      color: "#005B8E" },
  "012": { name: "BBVA México",          shortName: "BBVA",          color: "#004481" },
  "014": { name: "Santander",            shortName: "Santander",     color: "#EC0000" },
  "017": { name: "Banorte / IXE",        shortName: "Banorte",       color: "#E31837" },
  "021": { name: "HSBC México",          shortName: "HSBC",          color: "#DB0011" },
  "030": { name: "Bajío",                shortName: "Bajío",         color: "#F7A800" },
  "032": { name: "IXE Banco",            shortName: "IXE",           color: "#004A97" },
  "036": { name: "Inbursa",              shortName: "Inbursa",       color: "#003DA5" },
  "037": { name: "Interacciones",        shortName: "Interacciones", color: "#0072CE" },
  "042": { name: "Mifel",                shortName: "Mifel",         color: "#00A859" },
  "044": { name: "Scotiabank",           shortName: "Scotiabank",    color: "#EC111A" },
  "058": { name: "Banco del Ejército",   shortName: "Banjército",    color: "#006847" },
  "059": { name: "Afirme",              shortName: "Afirme",        color: "#E2231A" },
  "060": { name: "Bansi",                shortName: "Bansi",         color: "#00529B" },
  "062": { name: "Bansí",               shortName: "Bansí",         color: "#0067B2" },
  "072": { name: "Banorte",             shortName: "Banorte",       color: "#E31837" },
  "102": { name: "ABN AMRO",            shortName: "ABN",           color: "#009B3A" },
  "103": { name: "American Express",    shortName: "Amex",          color: "#007CC3" },
  "106": { name: "Bamsa",               shortName: "Bamsa",         color: "#003087" },
  "108": { name: "Tokyo",               shortName: "Tokyo",         color: "#BC002D" },
  "110": { name: "JP Morgan",           shortName: "JPMorgan",      color: "#003087" },
  "112": { name: "Bansol",              shortName: "Bansol",        color: "#0060AF" },
  "113": { name: "Vel'satis",           shortName: "Vel'satis",     color: "#4B0082" },
  "116": { name: "ING",                 shortName: "ING",           color: "#FF6200" },
  "124": { name: "Deutsche",            shortName: "Deutsche",      color: "#003399" },
  "126": { name: "Credit Suisse",       shortName: "CS",            color: "#001E62" },
  "127": { name: "Azteca",              shortName: "Azteca",        color: "#F4A900" },
  "128": { name: "Autofin",             shortName: "Autofin",       color: "#E31837" },
  "129": { name: "Barclays",            shortName: "Barclays",      color: "#00AEEF" },
  "130": { name: "Compartamos",         shortName: "Compartamos",   color: "#E31837" },
  "131": { name: "Banco Ahorro Famsa",  shortName: "Famsa",         color: "#E31837" },
  "132": { name: "Multiva",             shortName: "Multiva",       color: "#0066CC" },
  "133": { name: "Actinver",            shortName: "Actinver",      color: "#0057A8" },
  "134": { name: "Walmart",             shortName: "Walmart",       color: "#0071CE" },
  "136": { name: "Intercam Banco",      shortName: "Intercam",      color: "#005F9E" },
  "137": { name: "BanCoppel",           shortName: "BanCoppel",     color: "#FFD700" },
  "138": { name: "ABC Capital",         shortName: "ABC Capital",   color: "#003DA5" },
  "139": { name: "UBS Bank",            shortName: "UBS",           color: "#E30613" },
  "140": { name: "Consubanco",          shortName: "Consubanco",    color: "#E31837" },
  "141": { name: "Volkswagen",          shortName: "VW Bank",       color: "#001E50" },
  "143": { name: "CIBanco",             shortName: "CIBanco",       color: "#003F87" },
  "145": { name: "Bbase",               shortName: "Bbase",         color: "#0066CC" },
  "147": { name: "Bankaool",            shortName: "Bankaool",      color: "#00A651" },
  "148": { name: "PagaTodo",            shortName: "PagaTodo",      color: "#FF6600" },
  "149": { name: "Inmobiliario Mexicano", shortName: "Inmob MX",    color: "#003DA5" },
  "155": { name: "ICBC",               shortName: "ICBC",          color: "#CC0000" },
  "156": { name: "Sabadell",           shortName: "Sabadell",       color: "#007DBB" },
  "168": { name: "Hipotecaria Federal", shortName: "SHF",           color: "#004F9F" },
  "600": { name: "Monexcb",            shortName: "Monex",         color: "#005BAA" },
  "601": { name: "GBM",               shortName: "GBM",            color: "#0B3D91" },
  "602": { name: "Masari",             shortName: "Masari",         color: "#00529B" },
  "605": { name: "Valué",              shortName: "Valué",          color: "#004A97" },
  "606": { name: "Fondos y Valores",   shortName: "Fondeadora",     color: "#6B2FA0" },
  "608": { name: "FINCOMÚN",           shortName: "Fincomún",       color: "#00A651" },
  "610": { name: "HNC",               shortName: "HNC",            color: "#003087" },
  "611": { name: "HDIBANCO",          shortName: "HDI",            color: "#E31837" },
  "613": { name: "Order",             shortName: "Order",           color: "#FF6600" },
  "616": { name: "Mbxchange",         shortName: "Mbxchange",       color: "#005F9E" },
  "617": { name: "Perfect Money",     shortName: "PerfectMoney",    color: "#F7A800" },
  "618": { name: "Dealernet",         shortName: "Dealernet",       color: "#003DA5" },
  "621": { name: "CETES",             shortName: "CETES",           color: "#006847" },
  "622": { name: "MERCADO PAGO",      shortName: "Mercado Pago",    color: "#009EE3" },
  "626": { name: "Cabsa",             shortName: "Cabsa",           color: "#0057A8" },
  "627": { name: "Fondos Bicentenario",shortName: "Bicentenario",   color: "#006847" },
  "628": { name: "CODI Valida",       shortName: "CoDi",            color: "#E31837" },
  "629": { name: "HirSistemas",       shortName: "HirSistemas",     color: "#FF6600" },
  "630": { name: "Intercam Casa de Bolsa", shortName: "Intercam",   color: "#005F9E" },
  "631": { name: "FdeEAsociados",     shortName: "FdeEA",           color: "#003DA5" },
  "632": { name: "iBank",             shortName: "iBank",           color: "#0071CE" },
  "633": { name: "Rapipago",          shortName: "Rapipago",        color: "#00A651" },
  "634": { name: "Transfer",          shortName: "Transfer",        color: "#0066CC" },
  "636": { name: "HDI Seguros",       shortName: "HDI",             color: "#E31837" },
  "638": { name: "Nu México (Nubank)", shortName: "Nu",             color: "#820AD1" },
  "640": { name: "VE por Más",        shortName: "BX+",             color: "#FF6200" },
  "642": { name: "Reforma",           shortName: "Reforma",         color: "#003DA5" },
  "646": { name: "STP (Fintechs)",    shortName: "STP",             color: "#00A651" },
  "648": { name: "Evercore",          shortName: "Evercore",        color: "#003087" },
  "649": { name: "BBVA Bancomer (CI)", shortName: "BBVA",           color: "#004481" },
  "651": { name: "Bienestar",         shortName: "Bienestar",       color: "#E31837" },
  "652": { name: "UNAM",              shortName: "UNAM",            color: "#003DA5" },
  "653": { name: "Envia",             shortName: "Envia",           color: "#FF6600" },
  "655": { name: "VALMEX",           shortName: "Valmex",           color: "#0057A8" },
  "656": { name: "Fondos de Acceso", shortName: "Fondos",           color: "#005BAA" },
  "659": { name: "ASP Integra OPC",  shortName: "ASP",              color: "#003DA5" },
  "670": { name: "Libertad",         shortName: "Libertad",         color: "#00A651" },
  "674": { name: "AXA",              shortName: "AXA",              color: "#00008F" },
  "677": { name: "Caja Pop Mexicana", shortName: "CajaPop",         color: "#E31837" },
  "679": { name: "FND",              shortName: "FND",              color: "#006847" },
  "684": { name: "Transfer (2)",     shortName: "Transfer",         color: "#0066CC" },
  "685": { name: "Fondo (FIRA)",     shortName: "FIRA",             color: "#006847" },
  "686": { name: "Invex Gob",        shortName: "Invex",            color: "#003DA5" },
  "689": { name: "FDEFAM",           shortName: "FDEFAM",           color: "#005BAA" },
  "699": { name: "CoDi Valida (2)",  shortName: "CoDi",             color: "#E31837" },
  "706": { name: "Albo",             shortName: "Albo",             color: "#00C57A" },
  "710": { name: "TELECOMUNICACIONES", shortName: "Telecomm",       color: "#E31837" },
  "722": { name: "Mercado Pago",     shortName: "MP",               color: "#009EE3" },
  "723": { name: "Cuenca",           shortName: "Cuenca",           color: "#5A0FC8" },
  "728": { name: "Spin by OXXO",     shortName: "Spin",             color: "#E31837" },
  "730": { name: "Nvio",             shortName: "Nvio",             color: "#FF6600" },
  "732": { name: "Cuentacerta",      shortName: "Cuentacerta",      color: "#0071CE" },
  "733": { name: "Asea",             shortName: "Asea",             color: "#003DA5" },
  "734": { name: "Arcus",            shortName: "Arcus",            color: "#000000" },
  "736": { name: "Deteusche (alt)",  shortName: "Deutsche",         color: "#003399" },
  "740": { name: "ConCrédito",       shortName: "ConCrédito",       color: "#E31837" },
  "741": { name: "Bienestar (alt)",  shortName: "Bienestar",        color: "#E31837" },
  "742": { name: "STP (alt)",        shortName: "STP",              color: "#00A651" },
  "743": { name: "Tesored",          shortName: "Tesored",          color: "#003DA5" },
  "744": { name: "Cuenca (alt)",     shortName: "Cuenca",           color: "#5A0FC8" },
  "745": { name: "Bnet",             shortName: "Bnet",             color: "#0066CC" },
  "746": { name: "STP (Fondeadora)", shortName: "Fondeadora",       color: "#6B2FA0" },
  "747": { name: "Traxi",            shortName: "Traxi",            color: "#FF6600" },
  "748": { name: "Spin (alt)",       shortName: "Spin",             color: "#E31837" },
  "749": { name: "BBVA (alt)",       shortName: "BBVA",             color: "#004481" },
  "760": { name: "Clabe16",          shortName: "Clabe16",          color: "#003DA5" },
  "766": { name: "Banorte (Movil)",  shortName: "Banorte",          color: "#E31837" },
  "767": { name: "Klar",             shortName: "Klar",             color: "#1DB954" },
  "768": { name: "FONDO (Gobierno)", shortName: "Fondo",            color: "#006847" },
  "769": { name: "FONDO GOB2",       shortName: "FondoGob",         color: "#006847" },
  "812": { name: "Credicapital",     shortName: "Credicapital",     color: "#003DA5" },
  "814": { name: "Finpatria",        shortName: "Finpatria",        color: "#00A651" },
  "826": { name: "FINAMEX",          shortName: "Finamex",          color: "#003DA5" },
  "827": { name: "Valuef",           shortName: "Valuef",           color: "#005BAA" },
  "828": { name: "CBDELETRAS",       shortName: "CB Letras",        color: "#003087" },
  "829": { name: "CI Bolsa",         shortName: "CI Bolsa",         color: "#0057A8" },
  "846": { name: "STP (Sistema)",    shortName: "STP",              color: "#00A651" },
  "848": { name: "EVERCORE (CB)",    shortName: "Evercore",         color: "#003087" },
  "849": { name: "BBVA (CB)",        shortName: "BBVA",             color: "#004481" },
  "901": { name: "Cuadrante",        shortName: "Cuadrante",        color: "#003DA5" },
  "902": { name: "Indeval",          shortName: "Indeval",          color: "#005BAA" },
};

export function detectBank(clabe: string): BankInfo | null {
  const digits = clabe.replace(/\D/g, "");
  if (digits.length < 3) return null;
  const code = digits.substring(0, 3);
  return BANK_MAP[code] ?? null;
}
