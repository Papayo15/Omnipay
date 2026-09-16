// Conduit OFFRAMP Order management
// Flow: VA receives deposit → Conduit converts USD → payout to recipient's bank.
// In sandbox, payouts need cosign via simulate/cosign endpoint.

import { conduitRequest, isConduitSandbox } from "./client";
import type { ConduitOrder, ConduitOfframpDestination } from "./types";

export interface CreateOfframpParams {
  customerId:        string;
  sourceVaId:        string;
  amount:            number;       // USD amount
  destination:       ConduitOfframpDestination;
  externalReference: string;       // OPC-xxx order ID — key for webhook correlation
  purpose?:          string;
}

interface ConduitOrderResponse extends ConduitOrder {
  payoutId?: string;              // present when order creates an underlying payout
}

export async function createOfframpOrder(
  params: CreateOfframpParams,
): Promise<ConduitOrderResponse> {
  const body = {
    type:      "OFFRAMP",
    customerId: params.customerId,
    source: {
      assetType:        "USD",
      assetAmount:      params.amount.toFixed(2),
      virtualAccountId: params.sourceVaId,
    },
    destination: params.destination,
    externalReference: params.externalReference,
    purpose: params.purpose ?? "personal_transfer",
  };

  const order = await conduitRequest<ConduitOrderResponse>(
    "POST",
    "/orders",
    body,
    `order-${params.externalReference}`,
  );

  // Sandbox: if payout was created and requires machine signer, auto-cosign it
  if (isConduitSandbox() && order.payoutId) {
    try {
      await conduitRequest(
        "POST",
        `/sandbox/payouts/${order.payoutId}/simulate/cosign`,
      );
    } catch (e) {
      console.warn("[conduit/orders] cosign simulation failed:", (e as Error).message);
    }
  }

  return order;
}

export async function getConduitOrder(orderId: string): Promise<ConduitOrder> {
  return conduitRequest<ConduitOrder>("GET", `/orders/${orderId}`);
}
