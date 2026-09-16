// Conduit API — TypeScript types
// https://docs.conduit.financial

// ── Virtual Accounts ──────────────────────────────────────────────────────────

export interface ConduitDepositInstruction {
  // Conduit returns a union type per instruction — common fields:
  type: "us_domestic" | "uk_domestic" | "swift" | "sepa";
  currency: string;
  beneficiaryName: string;
  paymentReferenceRequired: boolean;
  paymentReference?: string;
  rails: string[];
  // us_domestic / swift
  routingNumber?: string;
  accountNumber?: string;
  bankName?: string;
  bankAddress?: string;
  // sepa / swift
  iban?: string;
  bic?: string;
  // uk_domestic
  sortCode?: string;
}

export interface ConduitVirtualAccount {
  id: string;
  status: "pending_activation" | "active" | "disabled";
  assetType: string;
  depositInstructions: ConduitDepositInstruction[];
  createdAt: string;
  updatedAt: string;
}

// ── Payouts ───────────────────────────────────────────────────────────────────
// POST /payouts — sends fiat from a VA to a bank account.
// (Orders are for crypto conversion — separate concept.)

export interface ConduitPayout {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  clientReferenceId?: string;     // OPC- orderId for webhook correlation
  assetAmount: { code: string; amount: string };
  createdAt: string;
  updatedAt: string;
}

// ── Orders (crypto conversion — not used for bank payouts) ────────────────────

export interface ConduitOrder {
  id: string;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  clientReferenceId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Webhook events ────────────────────────────────────────────────────────────
// Terminal events for bank payouts: payout.completed / payout.failed
// Deposit events: transaction.created / transaction.completed / transaction.failed
// See: https://docs.conduit.financial (webhook event types catalog)

export interface ConduitWebhookEvent {
  id:         string;
  type:       string;  // "payout.completed" | "payout.failed" | "transaction.completed" | ...
  created_at: string;
  data:       Record<string, unknown>;
}
