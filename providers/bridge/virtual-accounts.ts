// Bridge.xyz Virtual Accounts
// A virtual account gives the EMISOR (sender) a USD/CAD bank account to wire into.
// Bridge auto-converts deposits to USDC and routes to the liquidation address.

import { bridgeRequest } from "./client";

export interface VirtualAccount {
  id:             string;
  status:         string;
  customer_id:    string;
  source_currency: string;
  bank_name?:     string;
  // ACH (USA)
  routing_number?: string;
  account_number?: string;
  // Wire
  swift_code?:    string;
  // CLABE (MX sender)
  clabe?:         string;
  // General
  instructions?:  string;
  developer_reference?: string;
  created_at:     string;
}

export interface CreateVirtualAccountParams {
  customerId:        string;
  sourceCurrency:    "usd" | "cad" | "eur" | "gbp";
  destinationRail:   string;      // "spei" | "card" | "ach" etc.
  destinationCurrency: string;    // "mxn" | "usd" etc.
  developerFeeUsd?:  string;      // OmniPay's fee taken from each deposit
  reference?:        string;      // internal order reference
  webhookUrl?:       string;
}

export async function createVirtualAccount(
  params: CreateVirtualAccountParams,
): Promise<VirtualAccount> {
  const body: Record<string, unknown> = {
    customer_id:       params.customerId,
    source: {
      currency:      params.sourceCurrency,
      payment_rail:  "ach",  // ACH for USD, wire for others
    },
    destination: {
      payment_rail:  params.destinationRail,
      currency:      params.destinationCurrency,
    },
  };

  if (params.developerFeeUsd) {
    body.developer_fee = {
      amount:   params.developerFeeUsd,
      currency: params.sourceCurrency,
    };
  }

  if (params.reference) body.developer_reference = params.reference;
  if (params.webhookUrl) body.notification_url    = params.webhookUrl;

  return bridgeRequest<VirtualAccount>(
    "POST",
    "/virtual_accounts",
    body,
    `va-${params.customerId}-${params.reference ?? Date.now()}`,
  );
}

export async function getVirtualAccount(id: string): Promise<VirtualAccount> {
  return bridgeRequest<VirtualAccount>("GET", `/virtual_accounts/${id}`);
}
