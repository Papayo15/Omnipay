// ─────────────────────────────────────────────────────────────────────────────
// providers/pay-out/bitso.ts
//
// Bitso as an IPayOutProvider — SPEI direct payouts to Mexico only.
// Active when PAYOUT_PROVIDER_MX=bitso-direct in Vercel env vars.
//
// Env vars required:
//   BITSO_API_KEY, BITSO_API_SECRET, BITSO_API_BASE
// ─────────────────────────────────────────────────────────────────────────────

import { createWithdrawal }                  from "@/providers/bitso/withdrawals";
import { BitsoError }                        from "@/providers/bitso/client";
import type {
  IPayOutProvider,
  PayOutParams,
  PayOutResult,
  VirtualAccountParams,
  VirtualAccount,
  PayOutFeeInfo,
} from "./interface";

export const bitsoProvider: IPayOutProvider = {
  name: "bitso-direct",

  supportsCountry(country: string): boolean {
    return country.toUpperCase() === "MX";
  },

  async executeTransfer(params: PayOutParams): Promise<PayOutResult> {
    if (!bitsoProvider.supportsCountry(params.targetCountry)) {
      throw Object.assign(
        new Error(`Bitso does not support ${params.targetCountry}`),
        { code: "UNSUPPORTED_CORRIDOR" },
      );
    }

    // origin_id: max 40 chars, no dashes — strip dashes from orderId
    const origin_id = params.orderId.replace(/-/g, "").slice(0, 40);

    // Convert USDC amount to MXN using the passed usdcNetAmount as MXN directly.
    // The caller (checkout/webhook) is responsible for converting USDC → MXN before calling.
    // Bitso expects the amount in MXN as a string.
    const mxnAmount = params.usdcNetAmount.toFixed(2);

    try {
      const withdrawal = await createWithdrawal({
        amount:      mxnAmount,
        beneficiary: params.recipientName,
        clabe:       params.recipientAccount,
        origin_id,
        notes_ref:   params.reference.slice(0, 40),
      });

      const status: PayOutResult["status"] =
        withdrawal.status === "complete"    ? "COMPLETED"  :
        withdrawal.status === "failed"      ? "FAILED"     :
        withdrawal.status === "processing"  ? "PROCESSING" :
        "SUBMITTED";

      return {
        transferId:       withdrawal.wid,
        status,
        estimatedArrival: "minutes",
        provider:         "bitso-direct",
        localAmount:      parseFloat(mxnAmount),
        localCurrency:    "MXN",
      };
    } catch (err) {
      const e = err as BitsoError;
      // Map Bitso error codes to standard PayOut codes so the fallback logic works
      if (e.code === "0" || e.code === "missing_credentials") {
        throw Object.assign(new Error(e.message), { code: "UNSUPPORTED_CORRIDOR" });
      }
      if (e.code?.includes("invalid") || e.code?.includes("clabe")) {
        throw Object.assign(new Error(e.message), { code: "INVALID_ACCOUNT" });
      }
      throw err;
    }
  },

  async createVirtualAccount(_params: VirtualAccountParams): Promise<VirtualAccount> {
    // Bitso inbound uses Multi-CLABE — a separate flow handled by providers/bitso/clabes.ts.
    // Direct virtual account creation is not supported through this interface.
    throw Object.assign(
      new Error("Bitso inbound uses Multi-CLABE — use createClabe() directly"),
      { code: "VIRTUAL_ACCOUNT_UNSUPPORTED" },
    );
  },

  async getProviderFees(): Promise<PayOutFeeInfo> {
    // Bitso charges ~0.4% FX spread on MXN payouts; SPEI fee is typically MXN 4–5 fixed.
    // Source: Bitso API fee schedule (check dashboard for current rates).
    return {
      provider:    "bitso-direct",
      fxSpreadPct: 0.4,
      fixedFeeUsd: 0.25,   // ~MXN 4-5 at ~20 MXN/USD
      fetchedAt:   Date.now(),
      source:      "mock",
    };
  },
};
