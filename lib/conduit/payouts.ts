// Conduit fiat payout — sends money from a Virtual Account to a bank account.
// Correct endpoint: POST /payouts (NOT POST /orders — Orders are for crypto conversion)
//
// Before production: call GET /payouts/requirements?purpose=X&rail=Y&recipientType=individual
// to confirm exact required fields per corridor.

import { conduitRequest, isConduitSandbox } from "./client";

export interface ConduitRecipient {
  name:           string;
  // ACH / Fedwire
  accountNumber?: string;
  routingNumber?: string;
  accountType?:   "checking" | "savings";
  // SEPA
  iban?:          string;
  bic?:           string;
  // SPEI
  clabe?:         string;
  // PIX
  pixKey?:        string;
  // FPS
  sortCode?:      string;
}

export interface CreatePayoutParams {
  customerId:        string;
  virtualAccountId:  string;
  rail:              string;   // "ach" | "fedwire" | "sepa" | "spei" | "pix" | "fps"
  amount:            number;
  assetCode?:        string;   // default "USD"
  recipient:         ConduitRecipient;
  purpose?:          string;
  // OPC- orderId — stored in clientReferenceId for webhook correlation
  clientReferenceId: string;
}

interface ConduitPayoutResponse {
  id:                string;
  status:            string;
  clientReferenceId?: string;
  createdAt:         string;
}

export async function createConduitPayout(
  params: CreatePayoutParams,
): Promise<ConduitPayoutResponse> {
  const body: Record<string, unknown> = {
    customerId:        params.customerId,
    virtualAccountId:  params.virtualAccountId,
    purpose:           params.purpose ?? "personal_transfer",
    clientReferenceId: params.clientReferenceId,
    assetAmount: {
      code:   params.assetCode ?? "USD",
      amount: params.amount.toFixed(2),
    },
    destination: {
      type: "bank_account",
      rail: params.rail,
    },
    recipient: params.recipient,
  };

  const payout = await conduitRequest<ConduitPayoutResponse>(
    "POST",
    "/payouts",
    body,
    `payout-${params.clientReferenceId}`,
  );

  // Sandbox: simulate fiat rail settlement automatically
  if (isConduitSandbox()) {
    try {
      await conduitRequest(
        "POST",
        `/sandbox/payouts/${payout.id}/simulate/settled`,
        {},
      );
    } catch (e) {
      console.warn("[conduit/payouts] simulate/settled failed:", (e as Error).message);
    }
  }

  return payout;
}

export async function getConduitPayout(payoutId: string): Promise<ConduitPayoutResponse> {
  return conduitRequest<ConduitPayoutResponse>("GET", `/payouts/${payoutId}`);
}
