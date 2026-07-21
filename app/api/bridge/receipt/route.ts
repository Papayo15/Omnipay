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
//   - Bridge transfer ID (verifiable externally)
//   - Date/time
//   - WhatsApp and Telegram share links

import { NextRequest, NextResponse }    from "next/server";
import { getOrder }                     from "@/lib/order-state";
import { buildWhatsAppLink, buildTelegramLink, buildOmniPayMessage } from "@/lib/messaging";
import { getTransfer }                  from "@/providers/bridge/transfers";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const orderId = req.nextUrl.searchParams.get("order_id");
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const order = getOrder(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";
  const trackUrl = `${appUrl}/api/bridge/track?order_id=${orderId}`;

  // Try to get live transfer details from Bridge (amount received in local currency)
  let destinationAmount: string | null = null;
  let destinationCurrency: string | null = null;
  let bridgeTransferId: string | null = order.transferId ?? null;

  if (order.transferId && process.env.BRIDGE_API_KEY) {
    try {
      const tx = await getTransfer(order.transferId);
      destinationAmount   = tx.receipt?.destination_amount ?? null;
      destinationCurrency = tx.receipt?.destination_currency?.toUpperCase() ?? null;
      bridgeTransferId    = tx.id;
    } catch { /* use stored values */ }
  }

  const receiptData = {
    order_id:            orderId,
    bridge_transfer_id:  bridgeTransferId,
    status:              order.status,
    recipient_name:      order.recipientName,
    destination_country: order.destinationCountry,
    target_currency:     order.targetCurrency ?? destinationCurrency,
    destination_amount:  destinationAmount,
    created_at:          new Date(order.createdAt).toISOString(),
    completed_at:        order.completedAt ? new Date(order.completedAt).toISOString() : null,
    powered_by:          "Bridge.xyz",
    issuer:              "OmniPay Global",
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
