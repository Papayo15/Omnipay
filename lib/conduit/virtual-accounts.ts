// Conduit Virtual Account management
// Correct endpoint: POST /customers/{id}/features (not /virtual-accounts)
// Returns 202 Accepted — creation is async; poll GET until deposit instructions appear.

import { conduitRequest } from "./client";
import type { ConduitVirtualAccount } from "./types";

interface FeatureResponse {
  id:     string;
  type:   string;
  status: string;
}

interface VirtualAccountListResponse {
  data: ConduitVirtualAccount[];
}

// Creates a VA under OmniPay's platform customer.
// idempotency-key prevents duplicates on retry.
export async function createConduitVA(
  customerId: string,
  assetCode   = "USD",
): Promise<ConduitVirtualAccount> {
  // POST /customers/{id}/features — Conduit's feature-provisioning endpoint
  await conduitRequest<FeatureResponse>(
    "POST",
    `/customers/${customerId}/features`,
    {
      type:        "virtual_account",
      asset:       { code: assetCode },
      fields:      {},
      documentIds: [],
    },
    // Idempotency key scoped to customer + asset + timestamp (new VA per transfer)
    `va-${customerId}-${assetCode}-${Date.now()}`,
  );

  // Feature creation is async — poll until a VA with deposit instructions is returned
  return waitForVAActivation(customerId, assetCode);
}

export async function getConduitVAs(
  customerId: string,
): Promise<ConduitVirtualAccount[]> {
  const res = await conduitRequest<VirtualAccountListResponse>(
    "GET",
    `/customers/${customerId}/virtual-accounts`,
  );
  return res.data ?? [];
}

export async function getConduitVA(
  customerId: string,
  vaId:       string,
): Promise<ConduitVirtualAccount> {
  return conduitRequest<ConduitVirtualAccount>(
    "GET",
    `/customers/${customerId}/virtual-accounts/${vaId}`,
  );
}

export async function waitForVAActivation(
  customerId:  string,
  assetCode    = "USD",
  maxAttempts  = 12,
  delayMs      = 1500,
): Promise<ConduitVirtualAccount> {
  for (let i = 0; i < maxAttempts; i++) {
    const accounts = await getConduitVAs(customerId);
    // Find the most recently created active VA with deposit instructions
    const active = accounts
      .filter(va =>
        va.status === "active" &&
        va.assetType?.toUpperCase() === assetCode.toUpperCase() &&
        va.depositInstructions?.length > 0,
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (active.length > 0) return active[0];
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Conduit VA did not activate within ${maxAttempts * delayMs / 1000}s`);
}
