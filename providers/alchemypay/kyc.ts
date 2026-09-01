// Alchemy Pay KYC — Alchemy Pay verifies the end user itself; it does NOT accept
// merchant-attested KYC ("Merchant-side KYC on behalf of the user is not
// supported" per their docs). This is separate from — and in addition to —
// Bridge's sender-side KYC/KYB.
//
// Pending confirmation from Alchemy Pay (see plan): whether passing our
// merchantUserId lets them skip their own redundant verification for users we've
// already KYC'd via Bridge. Until confirmed, registerKyc() always uses the
// standard `email` flow (no `uid`) so the integration isn't blocked on that answer.
//
// Docs: https://alchemypay.readme.io/docs/kyc-registration
//       https://alchemypay.readme.io/docs/kyc-webhook

import { alchemyPayRequest } from "./client";

export interface RegisterKycParams {
  email?:       string;
  uid?:         string;        // merchantUserId — only once Alchemy Pay confirms it skips their KYC
  redirectUrl:  string;        // browser returns here after the user finishes KYC (valid 24h)
  callbackUrl:  string;        // server-side webhook fired with the result — see webhooks.ts
}

export interface KycLink {
  linkUrl: string;   // hosted KYC page — redirect the user here
  userNo:  string;
}

export async function registerKyc(params: RegisterKycParams): Promise<KycLink> {
  return alchemyPayRequest<KycLink>("POST", "/open/api/v4/kyc/registration", {
    body: {
      email:       params.email,
      uid:         params.uid,
      redirectUrl: params.redirectUrl,
      callbackUrl: params.callbackUrl,
    },
  });
}

export type KycStatus =
  | "NOT_INIT" | "CA_COMPLETED_PENDING_SCAN" | "PROCESSING_SCAN"
  | "PENDING_ACTION" | "COMPLETED" | "MANUAL_REVIEW" | "REJECTED";

export async function queryKycStatus(userNo: string): Promise<{ userNo: string; kycStatus: KycStatus }> {
  return alchemyPayRequest("GET", "/open/api/v4/kyc/status", { query: { userNo } });
}
