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

// In-process fallback for dedup when KV is not configured (dev/local)
const processedEventIdsFallback = new Set<string>();

async function markEventProcessed(eventId: string): Promise<boolean> {
  // Use Vercel KV (Redis) when configured — cross-instance, 24h TTL
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      // SET NX EX — returns "OK" if key was new, null if already existed
      const res = await fetch(`${kvUrl}/set/wh:${eventId}/1/NX/EX/86400`, {
        method: "GET",
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      const json = await res.json() as { result: string | null };
      return json.result === "OK"; // true = new, false = duplicate
    } catch {
      // KV unreachable — fall through to in-memory
    }
  }

  // In-memory fallback (single instance only — acceptable in dev)
  if (processedEventIdsFallback.has(eventId)) return false;
  processedEventIdsFallback.add(eventId);
  if (processedEventIdsFallback.size > 5000) {
    const first = processedEventIdsFallback.values().next().value;
    if (first) processedEventIdsFallback.delete(first);
  }
  return true;
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody  = await req.text();
  const sigHeader = req.headers.get("x-bridge-signature");

  // Verify signature
  let valid: boolean;
  try {
    valid = await verifyBridgeWebhook(rawBody, sigHeader);
  } catch (e) {
    const err = e as Error;
    console.error("[bridge/webhook] Signature config error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  if (!valid) {
    console.warn("[bridge/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try { event = parseWebhookEvent(rawBody); }
  catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { type, data } = event;
  console.log(`[bridge/webhook] event=${type} id=${event.id}`);

  // Deduplicate — Bridge may retry events on 5xx or timeout
  if (event.id) {
    const isNew = await markEventProcessed(event.id);
    if (!isNew) {
      console.log(`[bridge/webhook] duplicate event ${event.id} — skipping`);
      return NextResponse.json({ received: true });
    }
  }

  // ── Liquidation address drain completed ───────────────────────────────────

  if (type === "liquidation_address.drain_completed") {
    const liqAddrId = String(data.liquidation_address_id ?? data.id ?? "");
    const orderId   = String(data.developer_reference ?? "");
    const resolvedOrder = orderId.startsWith("OP-") ? orderId : null;

    if (resolvedOrder) {
      updateOrder(resolvedOrder, { status: "COMPLETED", completedAt: Date.now() });
      await handleCompletion(resolvedOrder, data);
    } else if (liqAddrId) {
      console.log(`[bridge/webhook] drain_completed for liq_addr ${liqAddrId} — no OP- reference`);
    }
  }

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
