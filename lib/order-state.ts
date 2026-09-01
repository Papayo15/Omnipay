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

export type OrderType = "p2p" | "b2b-bridge" | "b2b-stripe";

export interface OrderRecord {
  orderId:            string;
  status:             OrderStatus;
  orderType?:         OrderType;  // defaults to "p2p" if not set
  payInProvider?:     string;   // "bridge-va" | "alchemypay" | ...
  payOutProvider?:    string;   // "bridge-liq" | "alchemypay" | ...
  destinationCountry: string;
  recipientName:      string;
  recipientAccount:   string;     // cifrado — solo se guarda masked para display
  targetCurrency:     string;
  amount?:            number;     // sender amount in source currency
  usdcGross?:         number;
  usdcNet?:           number;
  omnipayFee?:        number;
  transferId?:        string;     // ID del payout en el proveedor de salida
  usedFallback?:      boolean;
  errorMessage?:      string;
  createdAt:          number;     // Unix ms
  updatedAt:          number;
  completedAt?:       number;
  // Email notifications (transient — not persisted to any external store)
  senderEmail?:       string;
  recipientEmail?:    string;
  trackUrl?:          string;
  senderLocale?:      string;   // BCP-47 locale of the sender (for email i18n)
  recipientLocale?:   string;   // BCP-47 locale of the recipient (for email i18n)
}

// ── Almacén: in-memory (L1) + Redis (L2 para persistencia cross-instancia) ────
const orderStore = new Map<string, OrderRecord>();
const ORDER_TTL_MS  = 48 * 60 * 60 * 1000;  // 48 horas
const REDIS_TTL_SEC = 48 * 60 * 60;           // 48 horas

// Lazy-loaded Redis client — only imported in Node.js runtime
async function redisSet(orderId: string, record: OrderRecord): Promise<void> {
  try {
    const { getRedis } = await import("@/lib/redis");
    const redis = await getRedis();
    await redis.set(`order:${orderId}`, JSON.stringify(record), { EX: REDIS_TTL_SEC });
  } catch { /* Redis failure never blocks the critical path */ }
}

async function redisGet(orderId: string): Promise<OrderRecord | null> {
  try {
    const { getRedis } = await import("@/lib/redis");
    const redis = await getRedis();
    const raw = await redis.get(`order:${orderId}`);
    if (!raw) return null;
    return JSON.parse(raw as string) as OrderRecord;
  } catch { return null; }
}

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
  // Strip PII before persisting to Redis (emails, account numbers)
  const safe = { ...record, senderEmail: undefined, recipientEmail: undefined, recipientAccount: "****" };
  void redisSet(orderId, safe);
  return record;
}

export function getOrder(orderId: string): OrderRecord | null {
  const record = orderStore.get(orderId);
  if (record) {
    if (Date.now() - record.createdAt > ORDER_TTL_MS) {
      orderStore.delete(orderId);
      return null;
    }
    return record;
  }
  return null;
}

// Async variant — falls back to Redis when not in local memory
export async function getOrderAsync(orderId: string): Promise<OrderRecord | null> {
  const local = getOrder(orderId);
  if (local) return local;
  const remote = await redisGet(orderId);
  if (remote) orderStore.set(orderId, remote);  // warm local cache
  return remote;
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

  if (patch.status && patch.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed.includes(patch.status)) {
      console.warn(`[OrderState] Transición inválida: ${existing.status} → ${patch.status} para ${orderId}`);
    }
  }

  const updated: OrderRecord = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    completedAt: patch.status === "COMPLETED" ? Date.now() : existing.completedAt,
  };
  orderStore.set(orderId, updated);
  const safe = { ...updated, senderEmail: undefined, recipientEmail: undefined, recipientAccount: "****" };
  void redisSet(orderId, safe);
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
