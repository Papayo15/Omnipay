// Alchemy Pay On-Ramp (fiat → USDC).
//
// NOTE — integration mode still pending a business decision (see plan): Native API
// Integration (merchant builds the whole payment UI) requires PCI DSS certification.
// Until that's confirmed, `createOnRampOrder` targets the Standard/redirect flow —
// it returns a hosted payment link (`payLink`) to redirect the sender to, instead of
// collecting card data directly. Switching to Native later only changes how the
// order is created (Get Token → Payment Method Form Query → Submit Form → Create
// Order), not the destination-address wiring below.
//
// Docs: https://alchemypay.readme.io/docs/native-api-integration

import { alchemyPayRequest } from "./client";

export interface CreateOnRampOrderParams {
  merchantOrderNo: string;   // OmniPay orderId — Alchemy Pay echoes it back on webhooks
  fiatAmount:      number;
  fiatCurrency:    string;   // ISO-4217, e.g. "AUD"
  country:         string;   // ISO 3166-1 alpha-2
  crypto:          string;   // e.g. "USDT" / "USDC"
  network:         string;   // Alchemy Pay network code — see providers/alchemypay/network-codes.md in their docs
  address:         string;   // destination crypto address — the recipient's Bridge liquidation address
  email?:          string;   // pre-fills the user's email on the hosted page
  redirectUrl?:    string;   // where the sender returns after paying
}

export interface OnRampOrder {
  orderNo:  string;   // Alchemy Pay's own order id
  payLink?: string;   // hosted payment page (Standard/redirect integration)
  status:   string;
}

export async function createOnRampOrder(params: CreateOnRampOrderParams): Promise<OnRampOrder> {
  return alchemyPayRequest<OnRampOrder>("POST", "/open/api/v4/merchant/trade/create", {
    body: {
      merchantOrderNo: params.merchantOrderNo,
      type:            "buy",
      fiatAmount:      params.fiatAmount,
      fiat:             params.fiatCurrency.toUpperCase(),
      country:         params.country.toUpperCase(),
      crypto:          params.crypto.toUpperCase(),
      network:         params.network,
      address:         params.address,
      email:           params.email,
      redirectUrl:     params.redirectUrl,
    },
  });
}

export interface OnRampOrderStatus {
  orderNo:         string;
  merchantOrderNo: string;
  status:          "PENDING" | "PAY_FAIL" | "PAY_SUCCESS" | "TRANSFER" | "CANCEL" | "FINISHED" | "RISK_CONTROL" | "REFUNDED";
  crypto?:         string;
  cryptoAmount?:   string;
  network?:        string;
  address?:        string;
  txHash?:         string;
}

export async function queryOnRampOrder(merchantOrderNo: string): Promise<OnRampOrderStatus> {
  return alchemyPayRequest<OnRampOrderStatus>("GET", "/open/api/v4/merchant/order/list", {
    query: { merchantOrderNo },
  });
}
