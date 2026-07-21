// Bridge.xyz Liquidation Addresses
// A liquidation address receives USDC and automatically converts it to local fiat,
// sending it to the receptor's bank account.
// Created once per receptor — reusable for multiple transactions.
//
// Verified supported rails (Bridge API docs, 2024):
//   ACH/Wire  → USD  → United States
//   SPEI      → MXN  → Mexico
//   PIX       → BRL  → Brazil
//   FPS       → GBP  → United Kingdom
//   SEPA      → EUR  → EEA (31 countries)
//   Bre-B     → COP  → Colombia (beta)
//
// NOT supported by Bridge: Canada EFT, India IMPS, Philippines InstaPay
// Those require Paysend/Kuba (pending contract) for card push.

import { bridgeRequest } from "./client";
import { createExternalAccount } from "./external-accounts";

// Countries with native payment rails on Bridge.
// All other countries → card-only (Paysend/Kuba, pending).
export const NATIVE_RAILS: Record<string, {
  rail:     string;
  currency: string;
  fields:   string[];
  label:    string;
}> = {
  // Americas
  US: { rail: "ach",  currency: "usd", fields: ["routing_number", "account_number"], label: "ACH Bank Account"   },
  MX: { rail: "spei", currency: "mxn", fields: ["clabe"],                            label: "CLABE (SPEI)"       },
  BR: { rail: "pix",  currency: "brl", fields: ["pix_key"],                          label: "Chave PIX"          },
  CO: { rail: "cop",  currency: "cop", fields: ["account_number", "bank_code"],      label: "Bre-B / Transferencia" },
  // United Kingdom
  GB: { rail: "fps",  currency: "gbp", fields: ["sort_code", "account_number"],      label: "Faster Payments"    },
  // SEPA — Eurozone (EUR)
  DE: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  FR: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  ES: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  IT: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  NL: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  PT: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  BE: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  AT: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  IE: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  FI: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  GR: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  CY: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  EE: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  LV: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  LT: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  LU: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  MT: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  SK: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  SI: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  HR: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  // SEPA — Non-Eurozone (EUR via SEPA IBAN)
  SE: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  DK: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  NO: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  PL: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  CZ: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  HU: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  RO: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  BG: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  CH: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  IS: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
  LI: { rail: "sepa", currency: "eur", fields: ["iban"], label: "SEPA (IBAN)" },
};

export interface LiquidationAddress {
  id:          string;
  currency:    string;
  network:     string;
  address:     string;
  destination: Record<string, unknown>;
  created_at:  string;
}

export type ReceiveMethod = "card" | "bank";

export interface CreateLiquidationParams {
  customerId:      string;
  country:         string;
  receiveMethod:   ReceiveMethod;
  // Card fields (card push — requires Paysend, pending)
  cardNumber?:     string;
  // Bank fields — depend on country rail
  clabe?:          string;
  iban?:           string;
  bic?:            string;  // SEPA: Bank Identifier Code
  pixKey?:         string;
  routingNumber?:  string;
  accountNumber?:  string;
  bankName?:       string;  // ACH: required by Bridge if it can't determine name from routing number
  sortCode?:       string;
  bankCode?:       string;  // Colombia Bre-B
  // Common
  ownerName:       string;
  ownerType?:      "individual" | "business";
}

const COUNTRY_ADDRESSES: Record<string, { street: string; city: string; state: string; postal_code: string }> = {
  // Americas
  US: { street: "123 Main Street", city: "New York",         state: "NY",  postal_code: "10001"    },
  MX: { street: "123 Main Street", city: "Ciudad de Mexico", state: "CDMX",postal_code: "06600"    },
  BR: { street: "123 Main Street", city: "São Paulo",        state: "SP",  postal_code: "01310100" },
  CO: { street: "123 Main Street", city: "Bogotá",           state: "DC",  postal_code: "110111"   },
  // UK
  GB: { street: "123 Main Street", city: "London",           state: "ENG", postal_code: "EC1A1BB"  },
  // Core SEPA EU
  DE: { street: "123 Main Street", city: "Berlin",           state: "BE",  postal_code: "10115"    },
  FR: { street: "123 Main Street", city: "Paris",            state: "IDF", postal_code: "75001"    },
  ES: { street: "123 Main Street", city: "Madrid",           state: "MD",  postal_code: "28001"    },
  IT: { street: "123 Main Street", city: "Rome",             state: "RM",  postal_code: "00100"    },
  NL: { street: "123 Main Street", city: "Amsterdam",        state: "NH",  postal_code: "1012AB"   },
  PT: { street: "123 Main Street", city: "Lisbon",           state: "11",  postal_code: "1000001"  },
  BE: { street: "123 Main Street", city: "Brussels",         state: "BRU", postal_code: "1000"     },
  AT: { street: "123 Main Street", city: "Vienna",           state: "9",   postal_code: "1010"     },
  IE: { street: "123 Main Street", city: "Dublin",           state: "D",   postal_code: "D01X2P3"  },
  FI: { street: "123 Main Street", city: "Helsinki",         state: "18",  postal_code: "00100"    },
  GR: { street: "123 Main Street", city: "Athens",           state: "AT",  postal_code: "10431"    },
  CY: { street: "123 Main Street", city: "Nicosia",          state: "1",   postal_code: "1010"     },
  EE: { street: "123 Main Street", city: "Tallinn",          state: "37",  postal_code: "10115"    },
  LV: { street: "123 Main Street", city: "Riga",             state: "RIX", postal_code: "LV1050"   },
  LT: { street: "123 Main Street", city: "Vilnius",          state: "VL",  postal_code: "01001"    },
  LU: { street: "123 Main Street", city: "Luxembourg",       state: "LU",  postal_code: "1111"     },
  MT: { street: "123 Main Street", city: "Valletta",         state: "VLT", postal_code: "VLT1000"  },
  SK: { street: "123 Main Street", city: "Bratislava",       state: "BL",  postal_code: "81102"    },
  SI: { street: "123 Main Street", city: "Ljubljana",        state: "61",  postal_code: "1000"     },
  HR: { street: "123 Main Street", city: "Zagreb",           state: "21",  postal_code: "10000"    },
  // Non-Eurozone SEPA
  SE: { street: "123 Main Street", city: "Stockholm",        state: "AB",  postal_code: "11120"    },
  DK: { street: "123 Main Street", city: "Copenhagen",       state: "84",  postal_code: "1050"     },
  NO: { street: "123 Main Street", city: "Oslo",             state: "03",  postal_code: "0150"     },
  PL: { street: "123 Main Street", city: "Warsaw",           state: "14",  postal_code: "00001"    },
  CZ: { street: "123 Main Street", city: "Prague",           state: "PR",  postal_code: "11000"    },
  HU: { street: "123 Main Street", city: "Budapest",         state: "BU",  postal_code: "1051"     },
  RO: { street: "123 Main Street", city: "Bucharest",        state: "B",   postal_code: "010011"   },
  BG: { street: "123 Main Street", city: "Sofia",            state: "22",  postal_code: "1000"     },
  CH: { street: "123 Main Street", city: "Zurich",           state: "ZH",  postal_code: "8001"     },
  IS: { street: "123 Main Street", city: "Reykjavik",        state: "1",   postal_code: "101"      },
  LI: { street: "123 Main Street", city: "Vaduz",            state: "11",  postal_code: "9490"     },
};

// Complete ISO 3166-1 alpha-2 → alpha-3 mapping (all 249 UN countries/territories)
const ISO3: Record<string, string> = {
  AF:"AFG", AX:"ALA", AL:"ALB", DZ:"DZA", AS:"ASM", AD:"AND", AO:"AGO", AI:"AIA",
  AQ:"ATA", AG:"ATG", AR:"ARG", AM:"ARM", AW:"ABW", AU:"AUS", AT:"AUT", AZ:"AZE",
  BS:"BHS", BH:"BHR", BD:"BGD", BB:"BRB", BY:"BLR", BE:"BEL", BZ:"BLZ", BJ:"BEN",
  BM:"BMU", BT:"BTN", BO:"BOL", BQ:"BES", BA:"BIH", BW:"BWA", BV:"BVT", BR:"BRA",
  IO:"IOT", BN:"BRN", BG:"BGR", BF:"BFA", BI:"BDI", CV:"CPV", KH:"KHM", CM:"CMR",
  CA:"CAN", KY:"CYM", CF:"CAF", TD:"TCD", CL:"CHL", CN:"CHN", CX:"CXR", CC:"CCK",
  CO:"COL", KM:"COM", CG:"COG", CD:"COD", CK:"COK", CR:"CRI", CI:"CIV", HR:"HRV",
  CU:"CUB", CW:"CUW", CY:"CYP", CZ:"CZE", DK:"DNK", DJ:"DJI", DM:"DMA", DO:"DOM",
  EC:"ECU", EG:"EGY", SV:"SLV", GQ:"GNQ", ER:"ERI", EE:"EST", SZ:"SWZ", ET:"ETH",
  FK:"FLK", FO:"FRO", FJ:"FJI", FI:"FIN", FR:"FRA", GF:"GUF", PF:"PYF", TF:"ATF",
  GA:"GAB", GM:"GMB", GE:"GEO", DE:"DEU", GH:"GHA", GI:"GIB", GR:"GRC", GL:"GRL",
  GD:"GRD", GP:"GLP", GU:"GUM", GT:"GTM", GG:"GGY", GN:"GIN", GW:"GNB", GY:"GUY",
  HT:"HTI", HM:"HMD", VA:"VAT", HN:"HND", HK:"HKG", HU:"HUN", IS:"ISL", IN:"IND",
  ID:"IDN", IR:"IRN", IQ:"IRQ", IE:"IRL", IM:"IMN", IL:"ISR", IT:"ITA", JM:"JAM",
  JP:"JPN", JE:"JEY", JO:"JOR", KZ:"KAZ", KE:"KEN", KI:"KIR", KP:"PRK", KR:"KOR",
  KW:"KWT", KG:"KGZ", LA:"LAO", LV:"LVA", LB:"LBN", LS:"LSO", LR:"LBR", LY:"LBY",
  LI:"LIE", LT:"LTU", LU:"LUX", MO:"MAC", MG:"MDG", MW:"MWI", MY:"MYS", MV:"MDV",
  ML:"MLI", MT:"MLT", MH:"MHL", MQ:"MTQ", MR:"MRT", MU:"MUS", YT:"MYT", MX:"MEX",
  FM:"FSM", MD:"MDA", MC:"MCO", MN:"MNG", ME:"MNE", MS:"MSR", MA:"MAR", MZ:"MOZ",
  MM:"MMR", NA:"NAM", NR:"NRU", NP:"NPL", NL:"NLD", NC:"NCL", NZ:"NZL", NI:"NIC",
  NE:"NER", NG:"NGA", NU:"NIU", NF:"NFK", MK:"MKD", MP:"MNP", NO:"NOR", OM:"OMN",
  PK:"PAK", PW:"PLW", PS:"PSE", PA:"PAN", PG:"PNG", PY:"PRY", PE:"PER", PH:"PHL",
  PN:"PCN", PL:"POL", PT:"PRT", PR:"PRI", QA:"QAT", RE:"REU", RO:"ROU", RU:"RUS",
  RW:"RWA", BL:"BLM", SH:"SHN", KN:"KNA", LC:"LCA", MF:"MAF", PM:"SPM", VC:"VCT",
  WS:"WSM", SM:"SMR", ST:"STP", SA:"SAU", SN:"SEN", RS:"SRB", SC:"SYC", SL:"SLE",
  SG:"SGP", SX:"SXM", SK:"SVK", SI:"SVN", SB:"SLB", SO:"SOM", ZA:"ZAF", GS:"SGS",
  SS:"SSD", ES:"ESP", LK:"LKA", SD:"SDN", SR:"SUR", SJ:"SJM", SE:"SWE", CH:"CHE",
  SY:"SYR", TW:"TWN", TJ:"TJK", TZ:"TZA", TH:"THA", TL:"TLS", TG:"TGO", TK:"TKL",
  TO:"TON", TT:"TTO", TN:"TUN", TR:"TUR", TM:"TKM", TC:"TCA", TV:"TUV", UG:"UGA",
  UA:"UKR", AE:"ARE", GB:"GBR", US:"USA", UM:"UMI", UY:"URY", UZ:"UZB", VU:"VUT",
  VE:"VEN", VN:"VNM", VG:"VGB", VI:"VIR", WF:"WLF", EH:"ESH", YE:"YEM", ZM:"ZMB",
  ZW:"ZWE",
};

function getAddress(country: string) {
  return COUNTRY_ADDRESSES[country] ?? { street: "123 Main Street", city: "Capital City", state: "NA", postal_code: "00000" };
}

// Build external account body per Bridge docs — exact field names from API reference:
// https://apidocs.bridge.xyz/platform/orchestration/external-accounts/external-accounts-api.md
function buildExternalAccountBody(params: CreateLiquidationParams): Record<string, unknown> {
  const country   = params.country.toUpperCase();
  const addr      = getAddress(country);
  const iso3      = ISO3[country] ?? country;
  const address   = {
    street_line_1: addr.street,
    city:          addr.city,
    state:         addr.state,
    postal_code:   addr.postal_code,
    country:       iso3,
  };
  const nameParts = params.ownerName.trim().split(" ");
  const firstName = nameParts[0];
  const lastName  = nameParts.slice(1).join(" ") || "-";
  const base = {
    account_owner_name: params.ownerName,
    account_owner_type: params.ownerType ?? "individual",
    first_name:         firstName,
    last_name:          lastName,
    address,
  };

  const native = NATIVE_RAILS[country];
  if (!native) throw new Error(`No native rail for country ${country}. Use card (Paysend) instead.`);

  // SPEI / Mexico — CLABE
  if (native.rail === "spei") {
    return {
      ...base,
      currency:     "mxn",
      account_type: "clabe",
      clabe:        { account_number: params.clabe! },
    };
  }
  // ACH / USA
  if (native.rail === "ach") {
    return {
      ...base,
      currency:     "usd",
      account_type: "us",
      bank_name:    params.bankName ?? "Chase Bank",
      account: {
        routing_number:      params.routingNumber!,
        account_number:      params.accountNumber!,
        checking_or_savings: "checking",
      },
    };
  }
  // SEPA / EU — IBAN (31 countries)
  if (native.rail === "sepa") {
    return {
      ...base,
      currency:     "eur",
      account_type: "iban",
      iban: {
        account_number: params.iban!,
        bic:            params.bic,   // optional but recommended for production
        country:        iso3,
      },
    };
  }
  // Faster Payments / UK
  if (native.rail === "fps") {
    return {
      ...base,
      currency:     "gbp",
      account_type: "gb",
      account: {
        sort_code:      params.sortCode!,
        account_number: params.accountNumber!,
      },
    };
  }
  // PIX / Brazil — pix_key format
  if (native.rail === "pix") {
    return {
      ...base,
      currency:     "brl",
      account_type: "pix",
      pix_key: {
        pix_key:         params.pixKey!,
        document_number: "00000000000",  // CPF placeholder for sandbox
      },
    };
  }
  // Bre-B / Colombia — account_type MUST be "bre_b", key field is bre_b_key
  if (native.rail === "cop") {
    return {
      ...base,
      currency:     "cop",
      account_type: "bre_b",
      account: {
        bre_b_key: params.accountNumber!,
      },
    };
  }

  throw new Error(`Unsupported rail: ${native.rail}`);
}

// Creates (or retrieves existing) external account for the customer.
// Called after simulate_kyc_approval to activate payout_fiat before
// createLiquidationAddress runs. Uses "pre-ext-" key prefix so it doesn't
// collide with the "ext-" key used inside createLiquidationAddress.
export async function ensureExternalAccount(params: CreateLiquidationParams): Promise<string> {
  const country   = params.country.toUpperCase();
  const identKey  = params.clabe?.slice(-4)
    ?? params.iban?.slice(-4)
    ?? params.pixKey?.slice(-4)
    ?? params.accountNumber?.slice(-4)
    ?? "xxxx";
  const extAcctBody = buildExternalAccountBody(params);
  try {
    const extAcct = await createExternalAccount(
      params.customerId,
      extAcctBody,
      `pre-ext-${params.customerId}-${country}-${identKey}`,
    );
    if (!extAcct?.id) throw new Error(`Bridge returned external account without id: ${JSON.stringify(extAcct)}`);
    return extAcct.id;
  } catch (e) {
    const bridgeErr = e as Error & { type?: string; details?: Record<string, unknown> };
    if (bridgeErr.type === "duplicate_external_account" && bridgeErr.details?.id) {
      return bridgeErr.details.id as string;
    }
    throw e;
  }
}

export async function createLiquidationAddress(
  params: CreateLiquidationParams,
): Promise<LiquidationAddress> {
  const country   = params.country.toUpperCase();
  const identKey  = params.clabe?.slice(-4)
    ?? params.iban?.slice(-4)
    ?? params.pixKey?.slice(-4)
    ?? params.accountNumber?.slice(-4)
    ?? "xxxx";

  if (params.receiveMethod === "card") {
    // Card push — requires Paysend/Kuba (pending contract). Bridge does not support card.
    throw new Error("Card push is not yet available. Use bank receive method.");
  }

  // Bank rails: create external account first, then reference it by ID.
  // Bridge returns duplicate_external_account (with the existing id in details)
  // when the same account info has been registered before — we reuse that id.
  const extAcctBody = buildExternalAccountBody(params);
  let extAcctId: string;
  try {
    const extAcct = await createExternalAccount(
      params.customerId,
      extAcctBody,
      `ext-${params.customerId}-${country}-${identKey}`,
    );
    if (!extAcct?.id) throw new Error(`Bridge returned external account without id: ${JSON.stringify(extAcct)}`);
    extAcctId = extAcct.id;
  } catch (e) {
    const bridgeErr = e as Error & { type?: string; details?: Record<string, unknown> };
    if (bridgeErr.type === "duplicate_external_account" && bridgeErr.details?.id) {
      extAcctId = bridgeErr.details.id as string;
    } else {
      throw e;
    }
  }

  // Bridge liquidation address API — all destination fields are TOP-LEVEL with destination_ prefix.
  // NOT nested under a "destination" key. Docs: external_account_id, destination_payment_rail,
  // destination_currency are all at root level alongside currency and chain.
  const destCurrency = NATIVE_RAILS[country]?.currency ?? "usd";
  const destRail     = NATIVE_RAILS[country]?.rail ?? "ach";
  const liqKey       = `liq7-${params.customerId}-${country}-${identKey}`;
  const liqBody      = {
    currency:                 "usdc",
    chain:                    "polygon",
    external_account_id:      extAcctId,
    destination_payment_rail: destRail,
    destination_currency:     destCurrency,
  };

  return bridgeRequest<LiquidationAddress>(
    "POST",
    `/customers/${params.customerId}/liquidation_addresses`,
    liqBody,
    liqKey,
  );
}

export async function getLiquidationAddress(
  customerId: string,
  liquidationAddressId: string,
): Promise<LiquidationAddress> {
  return bridgeRequest<LiquidationAddress>(
    "GET",
    `/customers/${customerId}/liquidation_addresses/${liquidationAddressId}`,
  );
}
