// GET /api/bridge/track?order_id=<id>
//
// Returns current order status for the UI to poll (every 2-3 seconds).
// Reads from the in-memory order state machine (lib/order-state.ts).
// In production, swap the Map for a KV store (Upstash/Vercel KV) for multi-instance support.

import { NextRequest, NextResponse } from "next/server";
import { getOrder }                  from "@/lib/order-state";

export const runtime = "edge";

const STATUS_LABELS: Record<string, { label: string; description: string; step: number }> = {
  PENDING_PAYIN: {
    label:       "Esperando depósito",
    description: "El emisor aún no ha depositado en la cuenta virtual.",
    step: 1,
  },
  PROCESSING_ONCHAIN: {
    label:       "Procesando",
    description: "Depósito recibido. Bridge está convirtiendo a la moneda local.",
    step: 2,
  },
  LIQUIDATING_FIAT: {
    label:       "Enviando al receptor",
    description: "Conversión completada. Enviando vía SPEI / tarjeta / riel local.",
    step: 3,
  },
  COMPLETED: {
    label:       "¡Completado!",
    description: "El dinero llegó exitosamente al receptor.",
    step: 4,
  },
  FAILED: {
    label:       "Error en la transferencia",
    description: "Ocurrió un problema. Si enviaste fondos, serán devueltos automáticamente por Bridge.",
    step: 0,
  },
};

export async function GET(req: NextRequest): Promise<Response> {
  const orderId = req.nextUrl.searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  }

  const order = getOrder(orderId);

  if (!order) {
    return NextResponse.json({
      order_id: orderId,
      status:   "PENDING_PAYIN",
      ...STATUS_LABELS["PENDING_PAYIN"],
      total_steps: 4,
      found:    false,
      note:     "Order not found in this instance. If you just paid, wait 30 seconds and try again.",
    });
  }

  const meta = STATUS_LABELS[order.status] ?? STATUS_LABELS["PENDING_PAYIN"];

  return NextResponse.json({
    order_id:           order.orderId,
    status:             order.status,
    label:              meta.label,
    description:        meta.description,
    step:               meta.step,
    total_steps:        4,
    recipient_name:     order.recipientName,
    destination_country: order.destinationCountry,
    target_currency:    order.targetCurrency,
    transfer_id:        order.transferId ?? null,
    error_message:      order.status === "FAILED" ? order.errorMessage : null,
    created_at:         new Date(order.createdAt).toISOString(),
    updated_at:         new Date(order.updatedAt).toISOString(),
    completed_at:       order.completedAt ? new Date(order.completedAt).toISOString() : null,
    found: true,
  });
}
