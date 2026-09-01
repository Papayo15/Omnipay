// GET /api/bridge/receipt?order_id=<id>
//
// Returns structured data for the comprobante (receipt) page.
// The actual PDF is generated client-side from this data (no server-side PDF needed).
// Also accessible via the signed URL from lib/link.ts: /resultado?r={token}
//
// The comprobante includes:
//   - OmniPay transaction ID
//   - Sender and recipient info (name, country)
//   - Amount sent + fees paid (line by line)
//   - Amount received in local currency
//   - Transfer ID (verifiable externally)
//   - Date/time
//   - WhatsApp and Telegram share links
//
// Provider-agnostic on purpose: an order can have settled through Bridge or
// through Alchemy Pay (payOutProvider) — the shape below is identical either
// way. `_settledVia` is internal telemetry only, never rendered to the user.

import { NextRequest, NextResponse }    from "next/server";
import { getOrderAsync }                from "@/lib/order-state";
import { buildWhatsAppLink, buildTelegramLink, buildOmniPayMessage } from "@/lib/messaging";
import { getTransfer }                  from "@/providers/bridge/transfers";
import { queryOffRampOrder }            from "@/providers/alchemypay/offramp";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const orderId = req.nextUrl.searchParams.get("order_id");
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const order = await getOrderAsync(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const trackUrl = `${appUrl}/api/bridge/track?order_id=${orderId}`;

  // Try to get live settlement details from whichever provider actually paid out.
  let destinationAmount: string | null = null;
  let destinationCurrency: string | null = null;
  let providerTransferId: string | null = order.transferId ?? null;

  if (order.payOutProvider === "alchemypay" && order.transferId) {
    try {
      const off = await queryOffRampOrder(orderId);
      destinationAmount   = off.fiatAmount ?? null;
      destinationCurrency = order.targetCurrency?.toUpperCase() ?? null;
      providerTransferId  = off.orderNo;
    } catch { /* use stored values */ }
  } else if (order.transferId && process.env.BRIDGE_API_KEY) {
    try {
      const tx = await getTransfer(order.transferId);
      destinationAmount   = tx.receipt?.destination_amount ?? null;
      destinationCurrency = tx.receipt?.destination_currency?.toUpperCase() ?? null;
      providerTransferId  = tx.id;
    } catch { /* use stored values */ }
  }

  const receiptData = {
    order_id:            orderId,
    transfer_id:         providerTransferId,
    status:              order.status,
    recipient_name:      order.recipientName,
    destination_country: order.destinationCountry,
    target_currency:     order.targetCurrency ?? destinationCurrency,
    destination_amount:  destinationAmount,
    created_at:          new Date(order.createdAt).toISOString(),
    completed_at:        order.completedAt ? new Date(order.completedAt).toISOString() : null,
    issuer:              "OmniPay Global",
    _settledVia:         order.payOutProvider ?? "bridge",   // internal only — do not render
  };

  // Build WhatsApp/Telegram share message
  const shareMessage = buildOmniPayMessage({
    clientName:    order.recipientName,
    transactionId: orderId,
    amount:        Number(destinationAmount ?? 0),
    currency:      destinationCurrency ?? order.targetCurrency ?? "USD",
    concept:       "Transferencia internacional OmniPay",
    date:          receiptData.completed_at ?? receiptData.created_at,
    trackingUrl:   trackUrl,
  });

  return NextResponse.json({
    receipt:      receiptData,
    share: {
      whatsapp: buildWhatsAppLink(shareMessage),
      telegram: buildTelegramLink(trackUrl, shareMessage),
      message:  shareMessage,
      track_url: trackUrl,
    },
  });
}
