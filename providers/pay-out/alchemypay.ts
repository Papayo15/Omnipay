// ─────────────────────────────────────────────────────────────────────────────
// providers/pay-out/alchemypay.ts
//
// Implementación de Alchemy Pay como proveedor de Pay-out (IPayOutProvider).
// Cubre corredores fiat sin riel nativo en Bridge: crea una orden off-ramp en
// Alchemy Pay (que entrega una dirección de depósito on-chain) y luego mueve el
// USDC ya custodiado por Bridge hacia esa dirección vía transfer cripto-a-cripto.
//
// El lado on-ramp de Alchemy Pay (fiat → USDC hacia una liquidation address de
// Bridge) NO encaja en este contrato — es un método de pay-in, no de pay-out — y
// se maneja aparte en app/api/alchemypay/onramp/*.
//
// Variables de entorno requeridas: ver providers/alchemypay/client.ts
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IPayOutProvider,
  PayOutParams,
  PayOutResult,
  VirtualAccountParams,
  VirtualAccount,
  PayOutFeeInfo,
} from "./interface";
import { createOffRampOrder, queryOffRampOrder } from "../alchemypay/offramp";
import { createOnChainTransfer } from "../bridge/transfers";

// Red on-chain que usa Bridge para custodiar el USDC — debe coincidir con el
// network code que Alchemy Pay espera para recibir en Polygon.
const SETTLEMENT_NETWORK = "MATIC";

export const alchemypayProvider: IPayOutProvider = {
  name: "alchemypay",

  supportsCountry(): boolean {
    // Fallback genérico — se activa explícitamente vía PAYOUT_PROVIDER_MX/GLOBAL,
    // no por auto-detección de país (Alchemy Pay cubre 173 países en su off-ramp).
    return true;
  },

  async executeTransfer(params: PayOutParams): Promise<PayOutResult> {
    const offRampOrder = await createOffRampOrder({
      merchantOrderNo: params.orderId,
      cryptoAmount:    params.usdcNetAmount,
      crypto:          "USDC",
      network:         SETTLEMENT_NETWORK,
      fiatCurrency:    params.targetCurrency,
      country:         params.targetCountry,
      bank: {
        accountName:   params.recipientName,
        accountNumber: params.recipientAccount,
      },
    });

    // Alchemy Pay ya está vigilando `offRampOrder.address` — recién ahora movemos
    // el USDC. Nunca al revés (ver providers/alchemypay/offramp.ts).
    const transfer = await createOnChainTransfer({
      orderId:    params.orderId,
      usdcAmount: params.usdcNetAmount,
      toAddress:  offRampOrder.address,
    });

    return {
      transferId:       offRampOrder.orderNo,
      status:           transfer.status === "payment_processed" ? "PROCESSING" : "SUBMITTED",
      estimatedArrival: "minutes to 2 hours",
      provider:         "alchemypay",
    };
  },

  async createVirtualAccount(_params: VirtualAccountParams): Promise<VirtualAccount> {
    // Alchemy Pay no ofrece cuentas virtuales bancarias — su on-ramp es un
    // hosted pay link / formulario, no una cuenta de recepción reutilizable.
    throw Object.assign(new Error("Alchemy Pay does not support virtual accounts"), {
      code: "VIRTUAL_ACCOUNT_UNSUPPORTED",
    });
  },

  async getProviderFees(): Promise<PayOutFeeInfo> {
    // Placeholder — sin tarifa comercial real confirmada todavía (ver plan:
    // "Fuera de alcance por ahora: tarifas/calculadora"). No usar este valor
    // para cálculos de fee visibles al usuario hasta reemplazarlo.
    return {
      provider:    "alchemypay",
      fxSpreadPct: 0,
      fixedFeeUsd: 0,
      fetchedAt:   Date.now(),
      source:      "mock",
    };
  },
};

// Reexport para que el status del off-ramp se pueda consultar desde el mismo
// punto de entrada que el resto del provider (usado por app/api/alchemypay/webhook).
export { queryOffRampOrder };
