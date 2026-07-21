// Bridge.xyz Liquidation Addresses
// A liquidation address receives USDC and automatically converts it to local fiat,
// sending it to the receptor's bank account or card.
// Created once per receptor — reusable for multiple transactions.

import { bridgeRequest } from "./client";
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

function buildDestination(params: CreateLiquidationParams): Record<string, unknown> {
  const country  = params.country.toUpperCase();
  const currency = getTargetCurrency(country).toLowerCase();

  if (params.receiveMethod === "card") {
    return {
      payment_rail: "card",
      currency:     "usd", // Bridge converts to USD equivalent for card push
      to_account: {
        card_number:        params.cardNumber!.replace(/\s/g, ""),
        account_owner_name: params.ownerName,
        account_owner_type: params.ownerType ?? "individual",
      },
    };
  }

  const native = NATIVE_RAILS[country];
  if (!native) {
    // Fallback to card if no native rail available
    throw new Error(`No native rail for country ${country}. Use card instead.`);
  }

  const toAccount: Record<string, string> = {
    account_owner_name: params.ownerName,
    account_owner_type: params.ownerType ?? "individual",
  };

  // Map fields by rail type
  if (native.rail === "spei")     { toAccount.bank_account_type = "clabe"; toAccount.clabe = params.clabe!; }
  if (native.rail === "sepa")     { toAccount.iban = params.iban!; }
  if (native.rail === "pix")      { toAccount.pix_key = params.pixKey!; }
  if (native.rail === "ach")      { toAccount.routing_number = params.routingNumber!; toAccount.account_number = params.accountNumber!; }
  if (native.rail === "fps")      { toAccount.sort_code = params.sortCode!; toAccount.account_number = params.accountNumber!; }
  if (native.rail === "eft")      { toAccount.transit_number = params.transitNumber!; toAccount.account_number = params.accountNumber!; }
  if (native.rail === "imps")     { toAccount.ifsc = params.ifsc!; toAccount.account_number = params.accountNumber!; }
  if (native.rail === "instapay") { toAccount.account_number = params.accountNumber!; }

  return {
    payment_rail: native.rail,
    currency,
    to_account:   toAccount,
  };
}

export async function createLiquidationAddress(
  params: CreateLiquidationParams,
): Promise<LiquidationAddress> {
  const destination = buildDestination(params);
  return bridgeRequest<LiquidationAddress>(
    "POST",
    `/customers/${params.customerId}/liquidation_addresses`,
    {
      currency:    "usdc",
      chain:       "polygon",
      destination,
    },
    `liq2-${params.customerId}-${params.country}-${params.receiveMethod}`,
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
