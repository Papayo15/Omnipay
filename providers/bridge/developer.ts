// Bridge developer account management
// Manages the fee external account — the US bank account (e.g. Wise USD)
// where Bridge deposits accumulated developer fees.
// Bridge only supports USD/ACH for developer fee payouts.

import { bridgeRequest } from "./client";

export interface FeeExternalAccount {
  id:                 string;
  account_type:       "us";
  currency:           "usd";
  account_owner_name: string;
  bank_name:          string;
  account: {
    account_number:      string;
    routing_number:      string;
    checking_or_savings: string;
  };
  address: {
    street_line_1: string;
    city:          string;
    state:         string;
    postal_code:   string;
    country:       string;
  };
  created_at: string;
  updated_at: string;
}

export async function getFeeExternalAccount(): Promise<FeeExternalAccount | null> {
  try {
    return await bridgeRequest<FeeExternalAccount>("GET", "/developer/fee_external_account");
  } catch {
    return null;
  }
}

export async function configureFeeExternalAccount(): Promise<FeeExternalAccount> {
  const ownerName     = process.env.FEE_ACCOUNT_OWNER_NAME ?? "";
  const bankName      = process.env.FEE_BANK_NAME          ?? "";
  const routingNumber = process.env.FEE_ROUTING_NUMBER     ?? "";
  const accountNumber = process.env.FEE_ACCOUNT_NUMBER     ?? "";
  const street        = process.env.FEE_STREET             ?? "";
  const city          = process.env.FEE_CITY               ?? "";
  const state         = process.env.FEE_STATE              ?? "";
  const postalCode    = process.env.FEE_POSTAL_CODE        ?? "";

  if (!ownerName || !routingNumber || !accountNumber) {
    throw new Error("Missing env vars: FEE_ACCOUNT_OWNER_NAME, FEE_ROUTING_NUMBER, FEE_ACCOUNT_NUMBER are required");
  }

  return bridgeRequest<FeeExternalAccount>(
    "POST",
    "/developer/fee_external_account",
    {
      account_type:       "us",
      currency:           "usd",
      account_owner_name: ownerName,
      bank_name:          bankName || "Wise",
      account: {
        account_number:      accountNumber,
        routing_number:      routingNumber,
        checking_or_savings: "checking",
      },
      address: {
        street_line_1: street || "1 Main St",
        city:          city   || "New York",
        state:         state  || "NY",
        postal_code:   postalCode || "10001",
        country:       "USA",
      },
    },
    "fee-ext-account-v1",
  );
}
