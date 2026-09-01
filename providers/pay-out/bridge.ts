// ─────────────────────────────────────────────────────────────────────────────
// providers/pay-out/bridge.ts
//
// Implementación de Bridge.xyz como proveedor de Pay-out.
// Bridge es un orchestrator que puede liquidar:
//   - MXN vía SPEI (corredor US→MX)
//   - USD vía ACH (corredor US doméstico)
//   - EUR vía SEPA (corredor Europe)
//   - Otras monedas via rieles locales
//
// Ventaja vs integración directa con un exchange:
//   - Bridge maneja la conversión USDC → fiat internamente
//   - Un solo contrato para múltiples corredores
//   - Cuentas virtuales de recepción (Virtual IBANs / US accounts)
//
// Variables de entorno requeridas:
//   BRIDGE_API_KEY        — API key de Bridge.xyz
//   BRIDGE_API_BASE       — URL base (default: https://api.bridge.xyz/v0)
//
// Docs sandbox: https://apidocs.bridge.xyz/
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IPayOutProvider,
  PayOutParams,
  PayOutResult,
  VirtualAccountParams,
  VirtualAccount,
  PayOutFeeInfo,
  PayOutProviderName,
} from "./interface";

const BRIDGE_BASE = process.env.BRIDGE_API_BASE ?? "https://api.bridge.xyz/v0";

// Corredores soportados por Bridge — actualizar según su documentación
const BRIDGE_SUPPORTED = new Set([
  "MX", "US", "CA", "GB", "DE", "FR", "ES", "IT", "NL", "PT",
  "BR", "CO", "AR", "PE", "CL", "EC", "GT", "CR", "PA",
  "IN", "PH", "NG", "KE", "GH", "ZA",
  "AU", "JP", "SG", "TH", "MY", "ID",
]);

function bridgeHeaders(apiKey: string): Record<string, string> {
  return {
    "Api-Key":     apiKey,
    "Content-Type": "application/json",
    "Idempotency-Key": "", // se rellena por operación
  };
}

export const bridgeProvider: IPayOutProvider = {
  name: "bridge" as PayOutProviderName,

  supportsCountry(country: string): boolean {
    return BRIDGE_SUPPORTED.has(country.toUpperCase());
  },

  async executeTransfer(params: PayOutParams): Promise<PayOutResult> {
    const apiKey = process.env.BRIDGE_API_KEY ?? "";
    if (!apiKey) throw new Error("BRIDGE_API_KEY is not configured. Add it to your Vercel environment variables.");

    const headers = { ...bridgeHeaders(apiKey), "Idempotency-Key": params.orderId };

    // Bridge recibe USDC en la wallet de OmniPay y ejecuta el payout local.
    // Referencia de la API: POST /v0/transfers
    const body = {
      amount:           params.usdcNetAmount.toFixed(6),
      currency:         "usdc",
      source: {
        payment_rail:  "polygon",
        currency:      "usdc",
      },
      destination: {
        payment_rail:   params.accountType === "card" ? "push_to_card" : "local_bank_wire",
        currency:       params.targetCurrency.toLowerCase(),
        to_address:     params.recipientAccount,
        to_name:        params.recipientName,
        to_country:     params.targetCountry,
      },
      developer_fee: {
        amount:   "0",   // OmniPay cobra su fee antes de llamar a Bridge
        currency: "usdc",
      },
      client_reference_id: `OP-${params.reference}`.slice(0, 50),
    };

    const res = await fetch(`${BRIDGE_BASE}/transfers`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      id?: string;
      status?: string;
      error?: { type?: string; message?: string };
    };

    if (!res.ok || !data.id) {
      const msg  = data.error?.message ?? `Bridge error ${res.status}`;
      const type = data.error?.type ?? "";
      if (type === "invalid_account_number") throw Object.assign(new Error(msg), { code: "INVALID_ACCOUNT" });
      if (type === "unsupported_corridor")   throw Object.assign(new Error(msg), { code: "UNSUPPORTED_CORRIDOR" });
      throw new Error(`Bridge transfer: ${msg}`);
    }

    return {
      transferId:       data.id!,
      status:           data.status === "payment_processed" ? "COMPLETED" : "SUBMITTED",
      estimatedArrival: params.targetCountry === "MX" ? "minutes" : "1-2 days",
      provider:         "bridge",
    };
  },

  async createVirtualAccount(params: VirtualAccountParams): Promise<VirtualAccount> {
    const apiKey = process.env.BRIDGE_API_KEY ?? "";
    if (!apiKey) throw new Error("BRIDGE_API_KEY is not configured. Add it to your Vercel environment variables.");

    const headers = { ...bridgeHeaders(apiKey), "Idempotency-Key": `va-${params.orderId}` };
    const res = await fetch(`${BRIDGE_BASE}/virtual_accounts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        currency:          params.targetCurrency.toLowerCase(),
        country:           params.targetCountry,
        customer_name:     params.customerName,
        developer_reference: params.orderId,
        notification_url:  params.callbackUrl,
      }),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(`Bridge virtual account: ${res.status}`);

    return {
      accountId:    String(data.id ?? ""),
      provider:     "bridge",
      bankName:     String(data.bank_name ?? "Bridge Virtual Bank"),
      clabe:        data.clabe as string | undefined,
      iban:         data.iban  as string | undefined,
      accountNumber: data.account_number as string | undefined,
      routingNumber: data.routing_number as string | undefined,
      currency:     params.targetCurrency,
      country:      params.targetCountry,
      instructions: String(data.instructions ?? "Follow Bridge instructions."),
    };
  },

  async getProviderFees(): Promise<PayOutFeeInfo> {
    // Bridge publica fees en su dashboard; aquí usamos el estimado conocido.
    // Live: GET /v0/fee_estimates?source_currency=usdc&destination_currency=mxn
    return {
      provider:    "bridge",
      fxSpreadPct: 0.5,    // ~0.5% spread típico
      fixedFeeUsd: 0,
      fetchedAt:   Date.now(),
      source:      "mock",
    };
  },
};
