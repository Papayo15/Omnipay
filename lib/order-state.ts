// ─────────────────────────────────────────────────────────────────────────────
// lib/order-state.ts
//
// Máquina de estados de órdenes P2P.
//
// IMPORTANTE — Stateless por diseño:
//   Este módulo usa un Map en memoria (process-level).
//   En una función serverless de Vercel, cada instancia tiene su propio Map.
//   Para producción con múltiples instancias, reemplazar con:
//     - Vercel KV (Redis compatible): import { kv } from "@vercel/kv"
//     - Upstash Redis
//     - Neon Postgres (si se quiere persistencia)
//
//   El cambio es mínimo: reemplazar orderStore.get/set/has con await kv.get/set.
//   La interfaz OrderRecord no cambia.
//
// Estados de la máquina:
//   PENDING_PAYIN → PROCESSING_ONCHAIN → LIQUIDATING_FIAT → COMPLETED
//                                                         → FAILED
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "PENDING_PAYIN"        // Link generado, esperando que el pagador pague
  | "PROCESSING_ONCHAIN"   // Pago detectado, esperando confirmaciones en Polygon
  | "LIQUIDATING_FIAT"     // USDC confirmado, ejecutando payout local
  | "COMPLETED"            // Payout exitoso
  | "FAILED";              // Error irrecuperable (se emitió refund si aplica)

export interface OrderRecord {
  orderId:            string;
  status:             OrderStatus;
  payInProvider?:     string;
  payOutProvider?:    string;
  destinationCountry: string;
  recipientName:      string;
  recipientAccount:   string;     // cifrado — solo se guarda masked para display
  targetCurrency:     string;
  usdcGross?:         number;
  usdcNet?:           number;
  omnipayFee?:        number;
  transferId?:        string;     // ID del payout en el proveedor de salida
  usedFallback?:      boolean;
  errorMessage?:      string;
  createdAt:          number;     // Unix ms
  updatedAt:          number;
  completedAt?:       number;
}

// ── Almacén en memoria (reemplazar con KV en producción) ─────────────────────
const orderStore = new Map<string, OrderRecord>();

// TTL: 48 horas. Las órdenes expiradas se limpian en getOrder().
const ORDER_TTL_MS = 48 * 60 * 60 * 1000;

export function createOrder(
  orderId: string,
  init: Omit<OrderRecord, "orderId" | "status" | "createdAt" | "updatedAt">,
): OrderRecord {
  const now = Date.now();
  const record: OrderRecord = {
    orderId,
    status: "PENDING_PAYIN",
    createdAt: now,
    updatedAt: now,
    ...init,
  };
  orderStore.set(orderId, record);
  return record;
}

export function getOrder(orderId: string): OrderRecord | null {
  const record = orderStore.get(orderId);
  if (!record) return null;
  // Expirar órdenes antiguas
  if (Date.now() - record.createdAt > ORDER_TTL_MS) {
    orderStore.delete(orderId);
    return null;
  }
  return record;
}

export function updateOrder(
  orderId: string,
  patch: Partial<Omit<OrderRecord, "orderId" | "createdAt">>,
): OrderRecord | null {
  const existing = getOrder(orderId);
  if (!existing) return null;

  const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PENDING_PAYIN:       ["PROCESSING_ONCHAIN", "FAILED"],
    PROCESSING_ONCHAIN:  ["LIQUIDATING_FIAT", "FAILED"],
    LIQUIDATING_FIAT:    ["COMPLETED", "FAILED"],
    COMPLETED:           [],
    FAILED:              [],
  };

  // Validar transición de estado si se está cambiando el status
  if (patch.status && patch.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed.includes(patch.status)) {
      console.warn(
        `[OrderState] Transición inválida: ${existing.status} → ${patch.status} para ${orderId}`,
      );
      // No lanzar — loguear y continuar (mejor que bloquear el webhook)
    }
  }

  const updated: OrderRecord = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    completedAt: patch.status === "COMPLETED" ? Date.now() : existing.completedAt,
  };
  orderStore.set(orderId, updated);
  return updated;
}

/** Máscara segura de la cuenta para display (nunca exponer datos reales) */
export function maskAccount(account: string): string {
  if (!account) return "****";
  const clean = account.replace(/\s/g, "");
  if (clean.length <= 4) return "****";
  return `${"*".repeat(clean.length - 4)}${clean.slice(-4)}`;
}

/** Estadísticas del store (para /api/admin/stats) */
export function getOrderStats(): {
  total: number;
  byStatus: Record<OrderStatus, number>;
} {
  const byStatus: Record<OrderStatus, number> = {
    PENDING_PAYIN:       0,
    PROCESSING_ONCHAIN:  0,
    LIQUIDATING_FIAT:    0,
    COMPLETED:           0,
    FAILED:              0,
  };
  orderStore.forEach((r) => { byStatus[r.status]++; });
  return { total: orderStore.size, byStatus };
}
