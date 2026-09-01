// Alchemy Pay Price/Quote Query — estimate only, does not create an order.
// Docs: https://alchemypay.readme.io/docs/price-query

import { alchemyPayRequest } from "./client";

export interface GetQuoteParams {
  side:     "BUY" | "SELL";   // BUY = on-ramp (fiat→crypto), SELL = off-ramp (crypto→fiat)
  crypto:   string;
  network:  string;
  fiat:     string;
  amount:   number;           // BUY: fiat amount to spend. SELL: crypto quantity to sell.
}

export interface Quote {
  cryptoPrice:       string;
  rampFee:           string;
  cryptoQuantity?:   string;  // BUY — estimated crypto received
  fiatQuantity?:     string;  // SELL — estimated fiat received (before fee)
  networkFee?:       string;
  cryptoNetworkFee?: string;
}

export async function getQuote(params: GetQuoteParams): Promise<Quote> {
  return alchemyPayRequest<Quote>("POST", "/open/api/v4/merchant/order/quoted/result", {
    body: {
      side:    params.side,
      crypto:  params.crypto.toUpperCase(),
      network: params.network,
      fiat:    params.fiat.toUpperCase(),
      amount:  params.amount,
    },
  });
}
