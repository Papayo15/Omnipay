// ─────────────────────────────────────────────────────────────────────────────
// app/api/track/route.ts
//
// GET /api/track?order_id=<id>
//
// Consulta el estado global de una orden por su ID.
// Devuelve la máquina de estados completa para que el frontend
// pueda mostrar el progreso en tiempo real (polling cada 2s).
//
// Estados posibles:
//   PENDING_PAYIN       — Esperando que el pagador complete el pago
//   PROCESSING_ONCHAIN  — Pago detectado, confirmaciones en Polygon
//   LIQUIDATING_FIAT    — USDC confirmado, ejecutando transferencia local
//   COMPLETED           — Transferencia exitosa
//   FAILED              — Error irrecuperable
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getOrder }                  from "@/lib/order-state";

export const runtime = "edge";

// Descripción amigable para el UI por cada estado
const STATUS_LABELS: Record<string, { label: string; description: string; step: number }> = {
  PENDING_PAYIN: {
    label:       "Esperando pago",
    description: "El pagador aún no ha completado el pago.",
    step:        1,
  },
  PROCESSING_ONCHAIN: {
    label:       "Procesando en blockchain",
    description: "El pago fue detectado. Esperando confirmaciones en la red Polygon.",
    step:        2,
  },
  LIQUIDATING_FIAT: {
    label:       "Enviando dinero",
    description: "USDC confirmado. Ejecutando la transferencia en moneda local.",
    step:        3,
  },
  COMPLETED: {
    label:       "¡Completado!",
    description: "El dinero fue enviado exitosamente al receptor.",
    step:        4,
  },
  FAILED: {
    label:       "Error en la transacción",
    description: "Ocurrió un error. Si pagaste, serás reembolsado automáticamente.",
    step:        0,
  },
};

export async function GET(req: NextRequest): Promise<Response> {
  const orderId = req.nextUrl.searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json(
      { error: "Parámetro order_id es requerido. Ej: /api/track?order_id=<id>" },
      { status: 400 },
    );
  }

  const order = getOrder(orderId);

  if (!order) {
    // Puede significar que la orden expiró (>48h) o que el order_id es inválido.
    // También puede ser que la instancia serverless sea diferente (estado perdido).
    // En ese caso devolvemos PENDING_PAYIN — el UI puede reintentar.
    return NextResponse.json({
      order_id:    orderId,
      status:      "PENDING_PAYIN",
      ...STATUS_LABELS["PENDING_PAYIN"],
      found:       false,
      note:        "Orden no encontrada en esta instancia. Si acabas de pagar, espera 30 segundos e intenta de nuevo.",
    });
  }

  const statusMeta = STATUS_LABELS[order.status] ?? STATUS_LABELS["PENDING_PAYIN"];

  return NextResponse.json({
    order_id:           order.orderId,
    status:             order.status,
    label:              statusMeta.label,
    description:        statusMeta.description,
    step:               statusMeta.step,
    total_steps:        4,

    // Datos financieros (solo presentes cuando el pago fue recibido)
    usdc_gross:         order.usdcGross ?? null,
    omnipay_fee:        order.omnipayFee ?? null,
    usdc_net:           order.usdcNet ?? null,

    // Datos de la orden
    destination_country: order.destinationCountry,
    target_currency:     order.targetCurrency,
    recipient_name:      order.recipientName,

    // Datos del proveedor (útil para soporte)
    payin_provider:      order.payInProvider ?? null,
    payout_provider:     order.payOutProvider ?? null,
    transfer_id:         order.transferId ?? null,
    used_fallback:       order.usedFallback ?? false,

    // Error (solo si FAILED)
    error_message:       order.status === "FAILED" ? order.errorMessage : null,

    // Timestamps
    created_at:          new Date(order.createdAt).toISOString(),
    updated_at:          new Date(order.updatedAt).toISOString(),
    completed_at:        order.completedAt ? new Date(order.completedAt).toISOString() : null,

    found: true,
  });
}
