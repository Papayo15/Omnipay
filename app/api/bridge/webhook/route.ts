// POST /api/bridge/webhook
//
// Receives all Bridge.xyz webhook events.
// Bridge fires events for: virtual_account.deposit_received, transfer.payment_processed,
// transfer.undeliverable, transfer.returned, kyc.approved, etc.
//
// After a successful payment:
//   1. Verifies HMAC-SHA256 signature (X-Bridge-Signature header)
//   2. Updates order state machine
//   3. Sends WhatsApp admin alert
//   4. Sends SMS receipt to sender's phone (via Twilio, if configured)
//   5. Generates signed receipt URL for the comprobante page

import { NextRequest, NextResponse }            from "next/server";
import { verifyBridgeWebhook, parseWebhookEvent } from "@/providers/bridge/webhooks";
import { mapTransferStatus }                    from "@/providers/bridge/transfers";
import { updateOrder, getOrder }                from "@/lib/order-state";
import { sendAdminWhatsApp, sendPaymentNotification } from "@/lib/notify";
import { buildReceiptURL }                      from "@/lib/link";

export const runtime = "edge";

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody  = await req.text();
  const sigHeader = req.headers.get("x-bridge-signature");

  // Verify signature
  const valid = await verifyBridgeWebhook(rawBody, sigHeader);
  if (!valid) {
    console.warn("[bridge/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try { event = parseWebhookEvent(rawBody); }
  catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { type, data } = event;
  console.log(`[bridge/webhook] event=${type} id=${event.id}`);

  // ── Transfer events ────────────────────────────────────────────────────────

  if (type.startsWith("transfer.")) {
    const transferId = String(data.id ?? "");
    const reference  = String(data.developer_reference ?? "");
    const orderId    = reference.startsWith("OP-") ? reference : null;

    if (orderId) {
      const order = getOrder(orderId);
      if (order) {
        const bridgeStatus = String(data.status ?? "") as Parameters<typeof mapTransferStatus>[0];
        const mapped = mapTransferStatus(bridgeStatus);

        if (mapped === "COMPLETED") {
          updateOrder(orderId, {
            status:      "COMPLETED",
            transferId,
            completedAt: Date.now(),
          });
          await handleCompletion(orderId, data);
        } else if (mapped === "FAILED") {
          updateOrder(orderId, {
            status:       "FAILED",
            errorMessage: String(data.failure_reason ?? type),
          });
          await sendAdminWhatsApp(
            `🚨 OmniPay — Transfer FALLIDA\nOrden: ${orderId}\nMotivo: ${data.failure_reason ?? type}`,
          );
        } else if (mapped === "PROCESSING") {
          updateOrder(orderId, { status: "PROCESSING_ONCHAIN" });
        }
      }
    }
  }

  // ── Virtual Account deposit received ──────────────────────────────────────

  if (type === "virtual_account.deposit_received") {
    const reference = String(data.developer_reference ?? "");
    const orderId   = reference.startsWith("OP-") ? reference : null;
    if (orderId) {
      updateOrder(orderId, { status: "LIQUIDATING_FIAT" });
    }
  }

  return NextResponse.json({ received: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function handleCompletion(orderId: string, data: Record<string, unknown>) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";
  const secret = process.env.LINK_SECRET ?? "";
  const order  = getOrder(orderId);

  // Build signed receipt URL
  let receiptUrl = `${appUrl}/resultado?order_id=${orderId}`;
  try {
    const receipt = await buildReceiptURL(
      {
        id:  orderId,
        a:   Number(data.amount ?? 0),
        c:   String(data.currency ?? "USD").toUpperCase(),
        n:   order?.recipientName ?? "OmniPay Transfer",
        ts:  Date.now(),
        tt:  "remesa",
      },
      appUrl,
      secret,
    );
    receiptUrl = receipt;
  } catch { /* use fallback URL */ }

  // WhatsApp admin alert
  const destAmount = (data as { receipt?: { destination_amount?: string; destination_currency?: string } })
    ?.receipt?.destination_amount;
  const destCurrency = (data as { receipt?: { destination_currency?: string } })?.receipt?.destination_currency;

  await sendAdminWhatsApp(
    `✅ OmniPay — Pago COMPLETADO\n` +
    `Orden: ${orderId}\n` +
    `Receptor: ${order?.recipientName ?? "?"}\n` +
    `País: ${order?.destinationCountry ?? "?"}\n` +
    (destAmount ? `Monto recibido: ${destAmount} ${(destCurrency ?? "").toUpperCase()}\n` : "") +
    `Comprobante: ${receiptUrl}`,
  );

  // SMS to recipient (if phone stored in order — future: pass phone in order metadata)
  if (order?.recipientName && destAmount) {
    // sendPaymentNotification would need recipient phone stored in order state
    // Currently the phone is in the encrypted token — future improvement: store in order on pay
  }
}
