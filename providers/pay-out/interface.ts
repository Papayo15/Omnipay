// ─────────────────────────────────────────────────────────────────────────────
// providers/pay-out/interface.ts
//
// Interfaz unificada para todos los proveedores de salida (Pay-out / Off-ramp).
//
// ¿Cómo añadir un nuevo proveedor de Pay-out?
//   1. Crea `mi-proveedor.ts` en esta carpeta
//   2. Implementa IPayOutProvider (todos los métodos son obligatorios)
//   3. Añade el nombre en PayOutProviderName
//   4. Registra en index.ts dentro de getMxPayOutProvider() o getGlobalPayOutProvider()
//   5. Ajusta la variable de entorno:
//        PAYOUT_PROVIDER_MX=mi-proveedor      (para México y LATAM)
//        PAYOUT_PROVIDER_GLOBAL=mi-proveedor  (para el resto del mundo)
// ─────────────────────────────────────────────────────────────────────────────

/** Parámetros de entrada para ejecutar un pago de salida */
export interface PayOutParams {
  orderId:        string;   // ID de la orden (para idempotencia)
  recipientName:  string;   // Nombre completo del receptor
  recipientAccount: string; // Cuenta destino: CLABE / IBAN / número de tarjeta 16d / etc.
  accountType:    PayOutAccountType;
  targetCountry:  string;   // ISO-3166 ej: "MX", "CO", "DE"
  targetCurrency: string;   // ISO-4217 ej: "MXN", "EUR", "USD"
  usdcNetAmount:  number;   // USDC a convertir DESPUÉS de restar el fee de OmniPay
  reference:      string;   // Referencia visible para el receptor
}

export type PayOutAccountType = "bank" | "card" | "wallet";

/** Resultado de una operación de pago de salida */
export interface PayOutResult {
  transferId:   string;                                                    // ID del proveedor
  status:       "SUBMITTED" | "PROCESSING" | "COMPLETED" | "FAILED";
  estimatedArrival?: string;                                               // "minutes" | "hours" | "1-2 days"
  provider:     PayOutProviderName;
  localAmount?: number;                                                    // Monto en moneda local (si disponible)
  localCurrency?: string;
}

/** Parámetros para crear una cuenta virtual de recepción (Bridge.xyz) */
export interface VirtualAccountParams {
  orderId:       string;
  customerName:  string;
  targetCountry: string;
  targetCurrency: string;
  callbackUrl:   string;  // URL donde el proveedor avisará cuando lleguen fondos
}

/** Cuenta virtual generada por el proveedor */
export interface VirtualAccount {
  accountId:    string;
  provider:     PayOutProviderName;
  bankName:     string;
  accountNumber?: string;
  routingNumber?: string;
  iban?:        string;
  clabe?:       string;
  swiftBic?:    string;
  currency:     string;
  country:      string;
  expiresAt?:   number;  // Unix ms — algunas cuentas son temporales
  instructions: string;  // Instrucciones para el pagador
}

/** Fee info del proveedor de salida para el monitor */
export interface PayOutFeeInfo {
  provider:     PayOutProviderName;
  fxSpreadPct:  number;   // % de spread FX aplicado (ej: 0.4 para Bitso)
  fixedFeeUsd:  number;   // Fee fijo por transferencia
  fetchedAt:    number;
  source:       "live" | "mock" | "cached";
}

export type PayOutProviderName = "bridge" | "bitso-direct" | "belo" | "paysend";

/** Contrato que todo proveedor de Pay-out debe cumplir */
export interface IPayOutProvider {
  readonly name: PayOutProviderName;

  /**
   * Indica si este proveedor puede liquidar en el país/moneda dados.
   * Usado por el orquestador para elegir el proveedor correcto.
   */
  supportsCountry(country: string): boolean;

  /**
   * Ejecuta la transferencia. Debe ser idempotente usando orderId.
   * Lanza con { code: "INVALID_ACCOUNT" | "INSUFFICIENT_FUNDS" | "UNSUPPORTED_CORRIDOR" }
   * para que el orquestador pueda hacer fallback.
   */
  executeTransfer(params: PayOutParams): Promise<PayOutResult>;

  /**
   * Crea una cuenta bancaria virtual para recibir fondos de entrada.
   * No todos los proveedores soportan esto — los que no deben lanzar con
   * { code: "VIRTUAL_ACCOUNT_UNSUPPORTED" }.
   */
  createVirtualAccount(params: VirtualAccountParams): Promise<VirtualAccount>;

  /**
   * Consulta los fees y spreads actuales del proveedor.
   * Usado por el script de monitoreo nocturno.
   */
  getProviderFees(): Promise<PayOutFeeInfo>;
}
