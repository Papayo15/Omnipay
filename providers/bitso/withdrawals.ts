// ─────────────────────────────────────────────────────────────────────────────
// providers/bitso/withdrawals.ts
//
// SPEI payouts to any Mexican CLABE via Bitso.
// POST /v3/withdrawals — currency: mxn, protocol: clabe
//
// Notes:
//   - origin_id is the idempotency key (max 40 chars, no dashes)
//   - cep_link only appears when status === "complete" — treat as optional
//   - notes_ref is the payment concept shown to the recipient (max 40 chars)
// ─────────────────────────────────────────────────────────────────────────────

import { bitsoRequest } from "./client";

export interface BitsoWithdrawalParams {
  amount:      string;    // MXN amount (e.g. "1500.00")
  beneficiary: string;    // recipient full name
  clabe:       string;    // 18-digit CLABE
  origin_id:   string;    // idempotency key, max 40 chars, no dashes
  notes_ref?:  string;    // payment concept for recipient (max 40 chars)
  rfc?:        string;    // recipient RFC (optional, for tax compliance)
}

export interface BitsoWithdrawal {
  wid:         string;
  status:      "pending" | "processing" | "complete" | "failed";
  currency:    string;
  method:      string;
  amount:      string;
  details: {
    clave_de_rastreo?: string;
    cep_link?:         string;   // only present when status === "complete"
    beneficiary_name?: string;
    clabe?:            string;
    notes_ref?:        string;
  };
  created_at: string;
  updated_at: string;
}

export async function createWithdrawal(params: BitsoWithdrawalParams): Promise<BitsoWithdrawal> {
  return bitsoRequest<BitsoWithdrawal>("POST", "/withdrawals", {
    currency:    "mxn",
    protocol:    "clabe",
    amount:      params.amount,
    beneficiary: params.beneficiary,
    clabe:       params.clabe,
    origin_id:   params.origin_id,
    notes_ref:   params.notes_ref ?? "OmniPay transfer",
    rfc:         params.rfc,
  });
}

export async function getWithdrawal(wid: string): Promise<BitsoWithdrawal> {
  return bitsoRequest<BitsoWithdrawal>("GET", `/withdrawals/${wid}`);
}
