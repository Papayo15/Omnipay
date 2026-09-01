// Alchemy Pay KYC — Alchemy Pay verifies the end user itself; it does NOT accept
// merchant-attested KYC ("Merchant-side KYC on behalf of the user is not
// supported" per their docs). This is separate from — and independent of —
// Bridge's sender-side KYC/KYB: each provider runs its own verification for
// its own leg of the order, by design. There is no cross-provider
// pre-verification (decided — not just deferred), so registerKyc() only ever
// uses the standard `email` flow.
//
// Docs: https://alchemypay.readme.io/docs/kyc-registration
//       https://alchemypay.readme.io/docs/kyc-webhook

import { alchemyPayRequest } from "./client";

export interface RegisterKycParams {
  email?:       string;
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
