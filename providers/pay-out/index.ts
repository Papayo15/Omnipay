// ─────────────────────────────────────────────────────────────────────────────
// providers/pay-out/index.ts
//
// Factory y orquestador de proveedores de Pay-out.
//
// Variables de entorno que controlan el routing:
//   PAYOUT_PROVIDER_MX=bridge | bitso-direct | belo
//   PAYOUT_PROVIDER_GLOBAL=bridge | paysend
//
// La lógica de fallback automático vive aquí:
//   - Si el proveedor principal lanza { code: "UNSUPPORTED_CORRIDOR" }
//     o { code: "INVALID_ACCOUNT" } → pasa al fallback
//   - Si el proveedor principal lanza { code: "CARD_RAIL_UNAVAILABLE" }
//     → reintenta como bank transfer con el mismo proveedor
// ─────────────────────────────────────────────────────────────────────────────

import type { IPayOutProvider, PayOutParams, PayOutResult, PayOutProviderName } from "./interface";
import { bridgeProvider } from "./bridge";

export type { IPayOutProvider, PayOutParams, PayOutResult, VirtualAccount, VirtualAccountParams, PayOutFeeInfo, PayOutProviderName } from "./interface";

/**
 * Bridge is now the sole pay-out provider for all countries.
 */
export function getMxPayOutProvider(): IPayOutProvider  { return bridgeProvider; }
export function getGlobalPayOutProvider(): IPayOutProvider { return bridgeProvider; }

/**
 * Selecciona automáticamente el proveedor correcto según el país destino.
 * Esta es la función que usan los webhooks — no necesitan saber qué proveedor corre.
 */
export function selectPayOutProvider(_targetCountry: string): IPayOutProvider {
  return bridgeProvider;
}

/**
 * Ejecuta la transferencia con fallback automático.
 * Orden de fallback:
 *   1. Proveedor principal (según env var)
 *   2. Si falla con CARD_RAIL_UNAVAILABLE → reintenta como bank
 *   3. Si falla con UNSUPPORTED_CORRIDOR → intenta con el proveedor global
 *   4. Si todo falla → lanza el último error
 */
export async function executeWithFallback(params: PayOutParams): Promise<PayOutResult & { usedFallback: boolean }> {
  const primary = selectPayOutProvider(params.targetCountry);
  let lastError: Error | null = null;

  // Intento 1: proveedor principal
  try {
    const result = await primary.executeTransfer(params);
    return { ...result, usedFallback: false };
  } catch (e) {
    lastError = e as Error;
    const code = (e as { code?: string }).code ?? "";

    // Si la tarjeta no está disponible, reintenta como bank con el mismo proveedor
    if (code === "CARD_RAIL_UNAVAILABLE" && params.accountType === "card") {
      try {
        const result = await primary.executeTransfer({ ...params, accountType: "bank" });
        console.warn(`[PayOut] Card rail unavailable for ${primary.name} → retried as bank`);
        return { ...result, usedFallback: true };
      } catch (e2) {
        lastError = e2 as Error;
      }
    }

    // Si el corredor no está soportado, intenta con el global
    if (code === "UNSUPPORTED_CORRIDOR") {
      const fallback = getGlobalPayOutProvider();
      if (fallback.name !== primary.name) {
        try {
          const result = await fallback.executeTransfer(params);
          console.warn(`[PayOut] Fallback to ${fallback.name} for country=${params.targetCountry}`);
          return { ...result, usedFallback: true };
        } catch (e3) {
          lastError = e3 as Error;
        }
      }
    }
  }

  throw lastError ?? new Error("All pay-out providers failed");
}

export function getAllPayOutProviders(): IPayOutProvider[] {
  return [bridgeProvider];
}
