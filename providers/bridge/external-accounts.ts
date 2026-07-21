// Bridge External Accounts — register a card or bank account for a customer
// Bridge requires a pre-created external account before referencing it in
// a liquidation address destination (external_account_id field).

import { bridgeRequest } from "./client";

export interface ExternalAccount {
  id:         string;
  status?:    string;
  created_at: string;
}

export async function createExternalAccount(
  customerId:     string,
  params:         Record<string, unknown>,
  idempotencyKey: string,
): Promise<ExternalAccount> {
  return bridgeRequest<ExternalAccount>(
    "POST",
    `/customers/${customerId}/external_accounts`,
    params,
    idempotencyKey,
  );
}
