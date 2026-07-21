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
