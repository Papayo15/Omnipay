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
import { getRedis }                             from "@/lib/redis";
import { verifyBridgeWebhook, parseWebhookEvent } from "@/providers/bridge/webhooks";
import { mapTransferStatus }                    from "@/providers/bridge/transfers";
import { updateOrder, getOrderAsync, createOrder } from "@/lib/order-state";
import { sendAdminWhatsApp, sendEmailNotification } from "@/lib/notify";
import { buildReceiptURL }                      from "@/lib/link";
import { emailStrings }                         from "@/lib/email-i18n";

// Node.js runtime required — redis package uses Node TCP sockets (incompatible with Edge)
export const runtime = "nodejs";

// In-process fallback for dedup when REDIS_URL is not set (dev/local)
const processedEventIdsFallback = new Set<string>();

async function markEventProcessed(eventId: string): Promise<boolean> {
  if (process.env.REDIS_URL) {
    try {
      const redis = await getRedis();
      const result = await redis.set(`wh:${eventId}`, "1", { NX: true, EX: 86400 });
      return result === "OK"; // true = new event, false = duplicate
    } catch (e) {
      console.error("[bridge/webhook] Redis error:", (e as Error).message);
      // Redis unreachable — fall through to in-memory fallback
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
      const order = await getOrderAsync(orderId);
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
    const vaId      = String(data.virtual_account_id ?? data.id ?? "");
    const reference = String(data.developer_reference ?? "");

    // Case 1: active OP- order exists → first-time deposit, advance state + email sender
    if (reference.startsWith("OP-")) {
      const order = await getOrderAsync(reference);
      if (order && order.status === "PENDING_PAYIN") {
        updateOrder(reference, { status: "LIQUIDATING_FIAT" });
        if (order.senderEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
          const eT = emailStrings(order.senderLocale);
          await sendEmailNotification(
            order.senderEmail,
            eT.deposit_subject,
            `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
              <h2 style="color:#16a34a;margin:0 0 16px">${eT.deposit_h2}</h2>
              <p>${eT.deposit_body(order.recipientName)}</p>
              <p><a href="${order.trackUrl ?? appUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">${eT.deposit_cta}</a></p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
              <p style="color:#6b7280;font-size:13px;text-align:center">${eT.footer_thanks}</p>
              <p style="color:#9ca3af;font-size:11px;margin-top:4px">OmniPay · ${eT.footer_auto}</p>
            </div>`,
          );
        }
      }
    }

    // Case 2: "Efecto Memoria" — recurring / unsolicited deposit
    // Sender transferred directly from their bank without going through OmniPay.
    // Auto-create a tracking order so the payment is processed correctly.
    else if (vaId && process.env.REDIS_URL) {
      try {
        const redis   = await getRedis();
        const metaStr = await redis.get(`va:${vaId}`);
        if (metaStr) {
          const vaMeta = JSON.parse(metaStr) as {
            liq_addr_id:         string;
            destination_country: string;
            target_currency:     string;
            source_currency:     string;
          };
          const newOrderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          createOrder(newOrderId, {
            orderType:          "p2p",
            destinationCountry: vaMeta.destination_country,
            targetCurrency:     vaMeta.target_currency,
            recipientName:      "OmniPay Transfer",  // no name stored — privacy policy
            recipientAccount:   vaMeta.liq_addr_id,
            payInProvider:      "bridge-va",
            payOutProvider:     "bridge-liq",
          });
          updateOrder(newOrderId, { status: "LIQUIDATING_FIAT" });
          await sendAdminWhatsApp(
            `🔄 OmniPay — Depósito recurrente (Efecto Memoria)\n` +
            `VA: ${vaId}\n` +
            `Orden auto-creada: ${newOrderId}\n` +
            `País: ${vaMeta.destination_country} · ${vaMeta.target_currency}`,
          );
          console.log(`[bridge/webhook] Efecto Memoria: auto-order ${newOrderId} for VA ${vaId}`);
        } else {
          console.warn(`[bridge/webhook] deposit_received VA ${vaId} — no Redis metadata found`);
        }
      } catch (e) {
        console.error("[bridge/webhook] Efecto Memoria Redis lookup failed:", (e as Error).message);
      }
    }
  }

  return NextResponse.json({ received: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────

export async function handleCompletion(orderId: string, data: Record<string, unknown>) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const secret = process.env.LINK_SECRET ?? "";
  // getOrderAsync falls back to Redis — works across Vercel instances
  const order  = await getOrderAsync(orderId);

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
        tt:  order?.orderType === "b2b-bridge" ? "bridge-b2b" : "bridge",
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

  const buildCompletionHtml = (eTx: ReturnType<typeof emailStrings>, role: "sender" | "recipient") => `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#16a34a;margin:0 0 16px">${eTx.completed_h2}</h2>
      ${role === "sender"
        ? `<p>${eTx.completed_sender(order?.recipientName ?? "")}</p>`
        : `<p>${eTx.completed_receiver}</p>`}
      ${destAmount ? `<p>${eTx.amount_received(destAmount, (destCurrency ?? "").toUpperCase())}</p>` : ""}
      <p><a href="${receiptUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${eTx.receipt_cta}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#6b7280;font-size:13px;text-align:center">${eTx.footer_thanks}</p>
      <p style="color:#9ca3af;font-size:11px;margin-top:8px">OmniPay · ${eTx.ref} ${orderId}</p>
    </div>`;

  if (order?.senderEmail) {
    const eTsender = emailStrings(order.senderLocale);
    await sendEmailNotification(order.senderEmail, eTsender.completed_subject, buildCompletionHtml(eTsender, "sender"));
  }
  if (order?.recipientEmail && order.recipientEmail !== order.senderEmail) {
    const eTrecipient = emailStrings(order.recipientLocale);
    await sendEmailNotification(order.recipientEmail, eTrecipient.completed_subject, buildCompletionHtml(eTrecipient, "recipient"));
  }
}
