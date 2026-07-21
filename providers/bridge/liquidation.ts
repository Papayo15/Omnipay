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

function buildExternalAccountBody(params: CreateLiquidationParams): Record<string, unknown> {
  const country  = params.country.toUpperCase();
  const currency = getTargetCurrency(country).toLowerCase();

  if (params.receiveMethod === "card") {
    return {
      payment_rail:       "card",
      currency:           "usd",
      card_number:        params.cardNumber!.replace(/\s/g, ""),
      account_owner_name: params.ownerName,
      account_owner_type: params.ownerType ?? "individual",
    };
  }

  const native = NATIVE_RAILS[country];
  if (!native) throw new Error(`No native rail for country ${country}. Use card instead.`);

  const body: Record<string, string> = {
    payment_rail:       native.rail,
    currency,
    account_owner_name: params.ownerName,
    account_owner_type: params.ownerType ?? "individual",
  };

  if (native.rail === "spei")     { body.bank_account_type = "clabe"; body.clabe = params.clabe!; }
  if (native.rail === "sepa")     { body.iban = params.iban!; }
  if (native.rail === "pix")      { body.pix_key = params.pixKey!; }
  if (native.rail === "ach")      { body.routing_number = params.routingNumber!; body.account_number = params.accountNumber!; }
  if (native.rail === "fps")      { body.sort_code = params.sortCode!; body.account_number = params.accountNumber!; }
  if (native.rail === "eft")      { body.transit_number = params.transitNumber!; body.account_number = params.accountNumber!; }
  if (native.rail === "imps")     { body.ifsc = params.ifsc!; body.account_number = params.accountNumber!; }
  if (native.rail === "instapay") { body.account_number = params.accountNumber!; }

  return body;
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
