// Alchemy Pay Off-Ramp (USDC → fiat, paid out to the recipient's bank account).
//
// Flow (see plan): (1) call createOffRampOrder here FIRST to get the `address`
// Alchemy Pay is watching for the deposit, (2) only then call
// providers/bridge/transfers.createOnChainTransfer() to send the USDC there.
// Never reverse this order — Alchemy Pay must have the deposit address active
// before the on-chain transfer lands, or the order can expire mid-flight.
//
// Docs: https://alchemypay.readme.io/docs/off-ramp-custom-parameters

import { alchemyPayRequest } from "./client";

export interface OffRampBankDetails {
  accountName:   string;
  accountNumber: string;   // IBAN / account number / PayID depending on country
  bankCode?:     string;   // BSB (AU), sort code (GB), routing number (US), etc.
  paymentType?:  string;   // Alchemy Pay payment method code, e.g. "10010" for bank transfer
}

export interface CreateOffRampOrderParams {
  merchantOrderNo: string;   // OmniPay orderId — echoed back on webhooks
  cryptoAmount:    number;
  crypto:          string;   // e.g. "USDC"
  network:         string;   // Alchemy Pay network code for the source chain (Polygon)
  fiatCurrency:    string;   // ISO-4217 target currency
  country:         string;   // ISO 3166-1 alpha-2 — recipient's country
  bank:            OffRampBankDetails;
  email?:          string;
}

export interface OffRampOrder {
  orderNo: string;
  address: string;   // deposit address to send the USDC to
  network: string;
  status:  string;
}

export async function createOffRampOrder(params: CreateOffRampOrderParams): Promise<OffRampOrder> {
  return alchemyPayRequest<OffRampOrder>("POST", "/open/api/v4/merchant/trade/order/create", {
    body: {
      merchantOrderNo: params.merchantOrderNo,
      type:            "sell",
      cryptoAmount:    params.cryptoAmount,
      crypto:          params.crypto.toUpperCase(),
      network:         params.network,
      fiat:            params.fiatCurrency.toUpperCase(),
      country:         params.country.toUpperCase(),
      accountName:     params.bank.accountName,
      account:         params.bank.accountNumber,
      bankCode:        params.bank.bankCode,
      paymentType:     params.bank.paymentType,
      email:           params.email,
    },
  });
}

// Off-ramp order status values per Alchemy Pay docs:
//   1 order created  2 USDC received  3 fiat payout started
//   4 payout success  5 payout failed  6 refunded  7 order expired
export type OffRampStatusCode = "1" | "2" | "3" | "4" | "5" | "6" | "7";

export interface OffRampOrderStatus {
  orderNo:         string;
  merchantOrderNo: string;
  status:          OffRampStatusCode;
  txHash?:         string;
  fiatAmount?:     string;
  cryptoActualAmount?: string;
}

export async function queryOffRampOrder(merchantOrderNo: string): Promise<OffRampOrderStatus> {
  return alchemyPayRequest<OffRampOrderStatus>("GET", "/open/api/v4/merchant/trade/order/query", {
    query: { merchantOrderNo },
  });
}
