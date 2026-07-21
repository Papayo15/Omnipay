// Bridge.xyz Virtual Accounts
// A virtual account gives the EMISOR (sender) a USD/EUR/GBP/MXN bank account to deposit into.
// Bridge auto-converts deposits to USDC and routes to the destination crypto address
// (our liquidation address on Polygon), which then pays out to the recipient's bank/card.
//
// Correct endpoint: POST /v0/customers/{customer_id}/virtual_accounts
// Docs: https://apidocs.bridge.xyz/docs/remittances

import { bridgeRequest } from "./client";

export interface VirtualAccountDepositInstructions {
  currency:                   string;
  payment_rail?:              string;
  payment_rails?:             string[];
  // ACH / Wire (USD)
  bank_name?:                 string;
  bank_address?:              string;
  bank_routing_number?:       string;
  bank_account_number?:       string;
  bank_beneficiary_name?:     string;
  bank_beneficiary_address?:  string;
  // SEPA (EUR)
  iban?:                      string;
  bic?:                       string;
  account_holder_name?:       string;
  // SPEI (MXN)
  clabe?:                     string;
  // PIX (BRL)
  br_code?:                   string;
  // Faster Payments (GBP)
  account_number?:            string;
  sort_code?:                 string;
}

export interface VirtualAccount {
  id:                          string;
  status:                      string;
  customer_id:                 string;
  developer_fee_percent:       string;
  created_at:                  string;
  source_deposit_instructions: VirtualAccountDepositInstructions;
  destination: {
    currency:      string;
    payment_rail:  string;
    address:       string;
  };
}

export interface CreateVirtualAccountParams {
  customerId:           string;
  sourceCurrency:       "usd" | "eur" | "gbp" | "mxn" | "brl";
  // Bridge liquidation address on Polygon (usdc)
  destinationAddress:   string;
  destinationNetwork:   "polygon" | "ethereum" | "solana";
  // OmniPay service fee taken automatically by Bridge per deposit
  developerFeePercent?: string;  // "1.25" = 1.25%
  reference?:           string;
}

export async function createVirtualAccount(
  params: CreateVirtualAccountParams,
): Promise<VirtualAccount> {
  const body: Record<string, unknown> = {
    source: {
      currency: params.sourceCurrency,
    },
    destination: {
      payment_rail: params.destinationNetwork,
      currency:     "usdc",
      address:      params.destinationAddress,
    },
  };

  if (params.developerFeePercent) {
    body.developer_fee_percent = params.developerFeePercent;
  }

  return bridgeRequest<VirtualAccount>(
    "POST",
    `/customers/${params.customerId}/virtual_accounts`,
    body,
    `va-${params.customerId}-${params.reference ?? Date.now()}`,
  );
}

export async function getVirtualAccount(
  customerId: string,
  vaId: string,
): Promise<VirtualAccount> {
  return bridgeRequest<VirtualAccount>(
    "GET",
    `/customers/${customerId}/virtual_accounts/${vaId}`,
  );
}
