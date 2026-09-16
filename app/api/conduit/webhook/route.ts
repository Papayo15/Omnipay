// POST /api/conduit/webhook
//
// Receives Conduit webhook events.
// Signature header: X-Conduit-Signature (format: "v1=<hex>")
//
// Terminal events for fiat bank payouts: payout.completed / payout.failed
// Deposit events: transaction.created / transaction.completed / transaction.failed
//
// NOTE: order.succeeded / order.failed are for CRYPTO conversion Orders —
// not for bank payouts. Do not confuse them.

import { NextRequest, NextResponse }                      from "next/server";
import { getRedis }                                       from "@/lib/redis";
import { verifyConduitWebhook, parseConduitWebhookEvent } from "@/lib/conduit/webhooks";
import { sendAdminWhatsApp, sendEmailNotification }       from "@/lib/notify";
import { buildReceiptURL }                                from "@/lib/link";
import { emailStrings }                                   from "@/lib/email-i18n";

export const runtime = "nodejs";

// In-process dedup fallback when Redis is not configured (dev/local)
const processedEventIds = new Set<string>();

async function markEventProcessed(eventId: string): Promise<boolean> {
  if (process.env.REDIS_URL) {
    try {
      const redis  = await getRedis();
      const result = await redis.set(`whc:${eventId}`, "1", { NX: true, EX: 86400 });
      return result === "OK";
    } catch (e) {
      console.error("[conduit/webhook] Redis error:", (e as Error).message);
    }
  }
  if (processedEventIds.has(eventId)) return false;
  processedEventIds.add(eventId);
  if (processedEventIds.size > 5000) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  return true;
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody   = await req.text();
  // Conduit signature header: X-Conduit-Signature (value: "v1=<hex>")
  const sigHeader = req.headers.get("x-conduit-signature");

  let valid: boolean;
  try {
    valid = await verifyConduitWebhook(rawBody, sigHeader);
  } catch (e) {
    const err = e as Error;
    console.error("[conduit/webhook] Signature config error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  if (!valid) {
    console.warn("[conduit/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try { event = parseConduitWebhookEvent(rawBody); }
  catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { type, data } = event;
  console.log(`[conduit/webhook] event=${type} id=${event.id}`);

  if (event.id) {
    const isNew = await markEventProcessed(event.id);
    if (!isNew) {
      console.log(`[conduit/webhook] duplicate event ${event.id} — skipping`);
      return NextResponse.json({ received: true });
    }
  }

  // ── Deposit: fiat received in VA ──────────────────────────────────────────

  if (type === "transaction.completed") {
    const txType  = String((data as { type?: unknown }).type ?? "");
    if (txType === "deposit") {
      const amount   = String((data as { assetAmount?: { amount?: unknown } }).assetAmount?.amount ?? "");
      const currency = String((data as { assetAmount?: { code?: unknown } }).assetAmount?.code ?? "USD");
      const vaId     = String((data as { virtualAccountId?: unknown }).virtualAccountId ?? "");
      await sendAdminWhatsApp(
        `💰 OmniPay Conduit — Depósito recibido\n` +
        `VA: ${vaId}\n` +
        `Monto: ${amount} ${currency}\n` +
        `Procesando conversión y envío al banco destino...`,
      );
    }
  }

  if (type === "transaction.failed") {
    const txType  = String((data as { type?: unknown }).type ?? "");
    const reason  = String((data as { failureCode?: unknown }).failureCode ?? "unknown");
    const vaId    = String((data as { virtualAccountId?: unknown }).virtualAccountId ?? "");
    await sendAdminWhatsApp(
      `❌ OmniPay Conduit — Transacción FALLIDA\n` +
      `VA: ${vaId} · Tipo: ${txType}\n` +
      `Motivo: ${reason}`,
    );
  }

  if (type === "transaction.awaiting_sender_information") {
    const vaId = String((data as { virtualAccountId?: unknown }).virtualAccountId ?? "");
    await sendAdminWhatsApp(
      `⚠️ OmniPay Conduit — Travel Rule Gate\n` +
      `VA: ${vaId}\n` +
      `Depósito detenido — requiere información del emisor.`,
    );
  }

  // ── Payout: bank transfer terminal events ─────────────────────────────────
  // These are the CORRECT terminal events for fiat bank payouts (POST /payouts).
  // payout.completed = funds reached recipient's bank.
  // payout.failed    = payout could not be delivered.

  if (type === "payout.completed") {
    const orderId = String(
      (data as { clientReferenceId?: unknown }).clientReferenceId ?? "",
    );
    if (orderId.startsWith("OPC-")) {
      await handleConduitCompletion(orderId, data);
    }
  }

  if (type === "payout.failed") {
    const orderId    = String((data as { clientReferenceId?: unknown }).clientReferenceId ?? "");
    const reasonCode = String((data as { failureCode?: unknown }).failureCode ?? "unknown");
    await sendAdminWhatsApp(
      `🚨 OmniPay Conduit — Pago FALLIDO\n` +
      (orderId ? `Orden: ${orderId}\n` : "") +
      `Motivo: ${reasonCode}`,
    );
  }

  // NOTE: order.succeeded / order.failed are for crypto Orders — not bank payouts.
  // Left here for completeness if OmniPay ever adds crypto conversion flows.

  return NextResponse.json({ received: true });
}

// ── Completion helper ──────────────────────────────────────────────────────

async function handleConduitCompletion(
  orderId: string,
  data:    Record<string, unknown>,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const secret = process.env.LINK_SECRET ?? "";

  let receiptUrl = `${appUrl}/resultado?order_id=${orderId}`;
  try {
    receiptUrl = await buildReceiptURL(
      {
        id:  orderId,
        a:   Number((data as { assetAmount?: { amount?: unknown } }).assetAmount?.amount ?? 0),
        c:   String((data as { assetAmount?: { code?: unknown } }).assetAmount?.code ?? "USD").toUpperCase(),
        n:   "OmniPay Transfer",
        ts:  Date.now(),
        tt:  "conduit",
      },
      appUrl,
      secret,
    );
  } catch { /* use fallback URL */ }

  const fechaHora = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", hour12: false });

  await sendAdminWhatsApp(
    `✅ OmniPay Conduit — Pago COMPLETADO\n` +
    `Orden: ${orderId}\n` +
    `Fecha: ${fechaHora}\n` +
    `Comprobante: ${receiptUrl}`,
  );

  const senderEmail = String((data as { senderEmail?: unknown }).senderEmail ?? "");
  if (senderEmail) {
    const eT  = emailStrings("es");
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#16a34a;margin:0 0 16px">${eT.completed_h2}</h2>
        <p>${eT.completed_sender("el destinatario")}</p>
        <p><a href="${receiptUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${eT.receipt_cta}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
        <p style="color:#9ca3af;font-size:11px">OmniPay · ${eT.ref} ${orderId}</p>
      </div>`;
    await sendEmailNotification(senderEmail, eT.completed_subject, html);
  }
}
