// Bridge.xyz Liquidation Addresses
// A liquidation address receives USDC and automatically converts it to local fiat,
// sending it to the receptor's bank account or card.
// Created once per receptor — reusable for multiple transactions.

import { bridgeRequest } from "./client";
import { createExternalAccount } from "./external-accounts";
import { getTargetCurrency } from "@/lib/routing";

// Countries with native payment rails (bank account option available)
// All other countries → card-only (Visa/MC push, 170+ countries)
export const NATIVE_RAILS: Record<string, {
  rail:     string;
  currency: string;
  fields:   string[];
  label:    string;
}> = {
  MX: { rail: "spei",      currency: "mxn", fields: ["clabe"],                            label: "CLABE (SPEI)"       },
  US: { rail: "ach",       currency: "usd", fields: ["routing_number", "account_number"], label: "ACH Bank Account"   },
  BR: { rail: "pix",       currency: "brl", fields: ["pix_key"],                          label: "Chave PIX"          },
  GB: { rail: "fps",       currency: "gbp", fields: ["sort_code", "account_number"],      label: "Faster Payments"    },
  CA: { rail: "eft",       currency: "cad", fields: ["transit_number", "account_number"], label: "EFT Bank Account"   },
  IN: { rail: "imps",      currency: "inr", fields: ["ifsc", "account_number"],           label: "IMPS Bank Transfer" },
  PH: { rail: "instapay",  currency: "php", fields: ["account_number"],                   label: "InstaPay"           },
  // European countries — SEPA
  DE: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  FR: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  ES: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  IT: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  NL: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  PT: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  BE: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  AT: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
  IE: { rail: "sepa",      currency: "eur", fields: ["iban"],                             label: "SEPA (IBAN)"        },
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
  // Card fields
  cardNumber?:     string;
  // Bank fields — depend on country
  clabe?:          string;
  iban?:           string;
  pixKey?:         string;
  routingNumber?:  string;
  accountNumber?:  string;
  sortCode?:       string;
  transitNumber?:  string;
  ifsc?:           string;
  // Common
  ownerName:       string;
  ownerType?:      "individual" | "business";
}

const COUNTRY_ADDRESSES: Record<string, { street: string; city: string; state: string; postal_code: string }> = {
  MX: { street: "123 Main Street", city: "Ciudad de Mexico", state: "CDMX",       postal_code: "06600"    },
  US: { street: "123 Main Street", city: "New York",         state: "NY",          postal_code: "10001"    },
  BR: { street: "123 Main Street", city: "São Paulo",        state: "SP",          postal_code: "01310100" },
  CO: { street: "123 Main Street", city: "Bogotá",           state: "DC",          postal_code: "110111"   },
  AR: { street: "123 Main Street", city: "Buenos Aires",     state: "BA",          postal_code: "C1000"    },
  PE: { street: "123 Main Street", city: "Lima",             state: "LM",          postal_code: "15001"    },
  GB: { street: "123 Main Street", city: "London",           state: "ENG",         postal_code: "EC1A1BB"  },
  DE: { street: "123 Main Street", city: "Berlin",           state: "BE",          postal_code: "10115"    },
  FR: { street: "123 Main Street", city: "Paris",            state: "IDF",         postal_code: "75001"    },
  ES: { street: "123 Main Street", city: "Madrid",           state: "MD",          postal_code: "28001"    },
  CA: { street: "123 Main Street", city: "Toronto",          state: "ON",          postal_code: "M5H2N2"   },
  IN: { street: "123 Main Street", city: "Mumbai",           state: "MH",          postal_code: "400001"   },
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

// Build external account body per Bridge docs:
// https://apidocs.bridge.xyz/platform/orchestration/external-accounts
function buildExternalAccountBody(params: CreateLiquidationParams): Record<string, unknown> {
  const country  = params.country.toUpperCase();
  const currency = getTargetCurrency(country).toLowerCase();
  const addr     = getAddress(country);
  const address  = {
    street_line_1: addr.street,
    city:          addr.city,
    state:         addr.state,
    postal_code:   addr.postal_code,
    country:       ISO3[country] ?? country,
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

  if (params.receiveMethod === "card") {
    // Debit/prepaid card push — account_type "card" (undocumented, best guess)
    return {
      ...base,
      currency:     "usd",
      account_type: "card",
      account: { account_number: params.cardNumber!.replace(/\s/g, "") },
    };
  }

  const native = NATIVE_RAILS[country];
  if (!native) throw new Error(`No native rail for country ${country}. Use card instead.`);

  // Bank rails — per Bridge external accounts docs
  if (native.rail === "spei") {
    return {
      ...base,
      currency:     "mxn",
      account_type: "clabe",
      clabe:        { account_number: params.clabe! },
    };
  }
  if (native.rail === "ach") {
    return {
      ...base,
      currency:     "usd",
      account_type: "us",
      account: {
        routing_number:      params.routingNumber!,
        account_number:      params.accountNumber!,
        checking_or_savings: "checking",
      },
    };
  }
  if (native.rail === "sepa") {
    return {
      ...base,
      currency:     "eur",
      account_type: "iban",
      iban: {
        account_number: params.iban!,
        country:        ISO3[country] ?? country,
      },
    };
  }
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
  if (native.rail === "pix") {
    return {
      ...base,
      currency:     "brl",
      account_type: "pix",
      pix_key: { pix_key: params.pixKey! },
    };
  }
  if (native.rail === "eft") {
    return {
      ...base,
      currency:     "cad",
      account_type: "ca",
      account: {
        transit_number: params.transitNumber!,
        account_number: params.accountNumber!,
      },
    };
  }
  if (native.rail === "imps") {
    return {
      ...base,
      currency:     "inr",
      account_type: "imps",
      account: { ifsc: params.ifsc!, account_number: params.accountNumber! },
    };
  }
  if (native.rail === "instapay") {
    return {
      ...base,
      currency:     "php",
      account_type: "instapay",
      account: { account_number: params.accountNumber! },
    };
  }

  throw new Error(`Unsupported rail: ${native.rail}`);
}

export async function createLiquidationAddress(
  params: CreateLiquidationParams,
): Promise<LiquidationAddress> {
  // Bridge requires a pre-created external account; its ID goes in destination
  const extAcctBody = buildExternalAccountBody(params);
  const cardLast4   = params.cardNumber?.slice(-4) ?? params.clabe?.slice(-4) ?? params.iban?.slice(-4) ?? "xxxx";
  const extAcct     = await createExternalAccount(
    params.customerId,
    extAcctBody,
    `ext-${params.customerId}-${params.receiveMethod}-${cardLast4}`,
  );

  const country  = params.country.toUpperCase();
  const currency = params.receiveMethod === "card" ? "usd" : getTargetCurrency(country).toLowerCase();
  const rail     = params.receiveMethod === "card" ? "card" : (NATIVE_RAILS[country]?.rail ?? "card");

  return bridgeRequest<LiquidationAddress>(
    "POST",
    `/customers/${params.customerId}/liquidation_addresses`,
    {
      currency:    "usdc",
      chain:       "polygon",
      destination: {
        payment_rail:        rail,
        currency,
        external_account_id: extAcct.id,
      },
    },
    `liq3-${params.customerId}-${params.country}-${params.receiveMethod}-${cardLast4}`,
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
