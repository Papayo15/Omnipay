// Conduit Virtual Account management
// VAs are created on-demand (stateless) — result goes back to client → localStorage.
// Mirrors providers/bridge/virtual-accounts.ts polling pattern.

import { conduitRequest } from "./client";
import type { ConduitVirtualAccount } from "./types";

export async function createConduitVA(
  customerId: string,
  assetType = "USD",
): Promise<ConduitVirtualAccount> {
  return conduitRequest<ConduitVirtualAccount>(
    "POST",
    `/customers/${customerId}/virtual-accounts`,
    { assetType },
    `va-${customerId}-${assetType}`,
  );
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
  customerId: string,
  vaId:       string,
  maxAttempts = 12,
  delayMs     = 1500,
): Promise<ConduitVirtualAccount> {
  for (let i = 0; i < maxAttempts; i++) {
    const va = await getConduitVA(customerId, vaId);
    if (va.status === "active") return va;
    if (va.status === "disabled") throw new Error(`Conduit VA ${vaId} is disabled`);
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  // Return last known state rather than throwing — caller can proceed and let webhook confirm
  return getConduitVA(customerId, vaId);
}
