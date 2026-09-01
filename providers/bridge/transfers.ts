// Bridge.xyz Transfers
// Used when Bridge orchestrates the full flow directly (alternative to VA → liquidation).
// Also used for polling transfer status from webhook events.

import { bridgeRequest } from "./client";

export interface BridgeTransfer {
  id:              string;
  status:          "awaiting_funds" | "in_review" | "funds_received" | "payment_submitted" | "payment_processed" | "undeliverable" | "returned" | "cancelled";
  amount:          string;
  currency:        string;
  source:          Record<string, unknown>;
  destination:     Record<string, unknown>;
  developer_fee?:  Record<string, unknown>;
  created_at:      string;
  updated_at:      string;
  receipt?:        { initial_amount?: string; final_amount?: string; destination_amount?: string; destination_currency?: string };
}

export async function getTransfer(id: string): Promise<BridgeTransfer> {
  return bridgeRequest<BridgeTransfer>("GET", `/transfers/${id}`);
}

// Crypto-to-crypto on-chain transfer — sends USDC already sitting in Bridge's
// custody (from a completed pay-in) out to an external wallet address instead of
// a bank account. Used by the Alchemy Pay off-ramp flow: after Alchemy Pay's
// off-ramp order gives us a deposit address, we call this to move the USDC there.
// Bridge API ref: POST /v0/transfers, destination.payment_rail: "polygon".
export async function createOnChainTransfer(params: {
  orderId:        string;   // used as idempotency key
  usdcAmount:     number;
  toAddress:      string;   // destination on-chain address (e.g. Alchemy Pay's off-ramp deposit address)
}): Promise<BridgeTransfer> {
  return bridgeRequest<BridgeTransfer>(
    "POST",
    "/transfers",
    {
      amount:   params.usdcAmount.toFixed(6),
      currency: "usdc",
      source: {
        payment_rail: "polygon",
        currency:     "usdc",
      },
      destination: {
        payment_rail: "polygon",
        currency:     "usdc",
        to_address:   params.toAddress,
      },
    },
    `onchain-${params.orderId}`,
  );
}

export function mapTransferStatus(status: BridgeTransfer["status"]): "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" {
  switch (status) {
    case "payment_processed": return "COMPLETED";
    case "undeliverable":
    case "returned":
    case "cancelled":         return "FAILED";
    case "awaiting_funds":    return "PENDING";
    default:                  return "PROCESSING";
  }
}
