// ─────────────────────────────────────────────────────────────────────────────
// providers/bitso/clabes.ts
//
// Multi-CLABE — one dedicated CLABE per end-user for MXN inbound SPEI deposits.
// Requires Multi-CLABE feature enabled on the Bitso account (contact account manager).
//
// After creating a CLABE, store the mapping clabe-${clabe} → orderId in order-state.ts
// so the webhook can associate incoming deposits with the correct order.
// ─────────────────────────────────────────────────────────────────────────────

import { bitsoRequest } from "./client";

export interface BitsoClabe {
  clabe:       string;    // 18-digit CLABE
  reference:   string;    // the reference we passed when creating
  status:      "active" | "inactive";
  balance:     string;    // MXN balance pending sweep
  created_at:  string;
}

export interface BitsoDeposit {
  did:         string;    // deposit ID
  clabe:       string;    // which CLABE received the deposit
  amount:      string;    // MXN amount
  currency:    "mxn";
  status:      "pending" | "complete" | "failed";
  clave_de_rastreo?: string;
  sender_name?: string;
  sender_rfc?:  string;
  created_at:  string;
}

export async function createClabe(params: { reference: string }): Promise<BitsoClabe> {
  return bitsoRequest<BitsoClabe>("POST", "/multi_clabe/clabes", {
    reference: params.reference,
  });
}

export async function getClabe(clabe: string): Promise<BitsoClabe> {
  return bitsoRequest<BitsoClabe>("GET", `/multi_clabe/clabes/${clabe}`);
}

export async function listClabes(): Promise<BitsoClabe[]> {
  return bitsoRequest<BitsoClabe[]>("GET", "/multi_clabe/clabes");
}

export async function listDeposits(since?: Date): Promise<BitsoDeposit[]> {
  const qs = since ? `?since=${since.toISOString()}` : "";
  return bitsoRequest<BitsoDeposit[]>("GET", `/multi_clabe/deposits${qs}`);
}
