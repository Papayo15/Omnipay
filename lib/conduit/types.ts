// Conduit API — TypeScript types
// https://docs.conduit.financial

// ── Virtual Accounts ──────────────────────────────────────────────────────────

export interface ConduitDepositInstruction {
  type: "us_domestic" | "uk_domestic" | "swift" | "sepa";
  currency: string;
  beneficiaryName: string;
  paymentReferenceRequired: boolean;
  paymentReference?: string;
  rails: string[];
  // us_domestic
  routingNumber?: string;
  accountNumber?: string;
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

// ── Customers ─────────────────────────────────────────────────────────────────

export interface ConduitCustomer {
  id: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  type: "individual" | "business";
  createdAt: string;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface ConduitOrderSource {
  assetAmount: string;
  assetType: string;
  virtualAccountId?: string;
}

export interface ConduitOrderDestination {
  assetAmount: string;
  assetType: string;
  type?: string;
  rail?: string;
  currency?: string;
}

export interface ConduitOrder {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  type: "ONRAMP" | "OFFRAMP";
  externalReference?: string;
  source: ConduitOrderSource;
  destination: ConduitOrderDestination;
  reasonCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConduitOfframpDestination {
  type: "bank_account";
  rail: string;           // "ach" | "fedwire" | "sepa" | "spei" | "pix" | "fps"
  currency: string;
  accountNumber?: string;
  routingNumber?: string; // ACH / Fedwire
  iban?: string;          // SEPA
  bic?: string;           // SEPA
  clabe?: string;         // SPEI
  pixKey?: string;        // PIX
  sortCode?: string;      // FPS
  beneficiaryName: string;
  beneficiaryCountry: string;
}

// ── Webhook events ────────────────────────────────────────────────────────────

export interface ConduitWebhookEvent {
  id: string;
  type: string;           // "transaction.completed", "order.succeeded", etc.
  created_at: string;
  data: Record<string, unknown>;
}
