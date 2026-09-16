// POST /api/conduit/webhook
//
// Receives Conduit webhook events.
// Events handled:
//   transaction.completed           — fiat deposit received in VA
//   transaction.failed              — deposit failed
//   transaction.awaiting_sender_information — Travel Rule gate
//   order.succeeded                 — terminal: payout delivered to recipient's bank
//   order.failed                    — order failed (reasonCode in data)
//   order.cancelled                 — order cancelled

import { NextRequest, NextResponse }                from "next/server";
import { getRedis }                                 from "@/lib/redis";
import { verifyConduitWebhook, parseConduitWebhookEvent } from "@/lib/conduit/webhooks";
import { sendAdminWhatsApp, sendEmailNotification } from "@/lib/notify";
import { buildReceiptURL }                          from "@/lib/link";
import { emailStrings }                             from "@/lib/email-i18n";

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
  const rawBody    = await req.text();
  // Conduit sends signature in x-conduit-signature; confirm exact header name with their docs
  const sigHeader  = req.headers.get("x-conduit-signature")
                  ?? req.headers.get("x-webhook-signature");

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

  // ── Transaction: fiat deposit received in VA ──────────────────────────────

  if (type === "transaction.completed") {
    const vaId  = String(data.virtualAccountId ?? data.virtual_account_id ?? "");
    const amount = String(data.amount ?? "");
    const currency = String(data.currency ?? "USD");
    await sendAdminWhatsApp(
      `💰 OmniPay Conduit — Depósito recibido\n` +
      `VA: ${vaId}\n` +
      `Monto: ${amount} ${currency}\n` +
      `Procesando conversión y envío al banco destino...`,
    );
  }

  if (type === "transaction.failed") {
    const vaId    = String(data.virtualAccountId ?? data.virtual_account_id ?? "");
    const reason  = String(data.reasonCode ?? data.reason ?? "unknown");
    await sendAdminWhatsApp(
      `❌ OmniPay Conduit — Depósito FALLIDO\n` +
      `VA: ${vaId}\n` +
      `Motivo: ${reason}`,
    );
  }

  if (type === "transaction.awaiting_sender_information") {
    const vaId = String(data.virtualAccountId ?? data.virtual_account_id ?? "");
    await sendAdminWhatsApp(
      `⚠️ OmniPay Conduit — Travel Rule Gate\n` +
      `VA: ${vaId}\n` +
      `Depósito detenido — requiere información del emisor.`,
    );
  }

  // ── Order: OFFRAMP completed ──────────────────────────────────────────────

  if (type === "order.succeeded") {
    const orderId = String(
      (data as { externalReference?: string }).externalReference
      ?? (data as { external_reference?: string }).external_reference
      ?? (data as { id?: string }).id
      ?? "",
    );
    if (orderId.startsWith("OPC-")) {
      await handleConduitCompletion(orderId, data);
    }
  }

  // ── Order: OFFRAMP failed ─────────────────────────────────────────────────

  if (type === "order.failed" || type === "order.cancelled") {
    const orderId   = String(
      (data as { externalReference?: string }).externalReference
      ?? (data as { external_reference?: string }).external_reference
      ?? "",
    );
    const reasonCode = String((data as { reasonCode?: string }).reasonCode ?? type);
    const label = type === "order.cancelled" ? "CANCELADA" : "FALLIDA";
    await sendAdminWhatsApp(
      `🚨 OmniPay Conduit — Orden ${label}\n` +
      (orderId ? `Orden: ${orderId}\n` : "") +
      `Motivo: ${reasonCode}`,
    );
  }

  return NextResponse.json({ received: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
        a:   Number((data as { amount?: unknown }).amount ?? 0),
        c:   String((data as { currency?: unknown }).currency ?? "USD").toUpperCase(),
        n:   "OmniPay Transfer",
        ts:  Date.now(),
        tt:  "conduit",
      },
      appUrl,
      secret,
    );
  } catch { /* use fallback URL */ }

  const destAmount   = String((data as { destinationAmount?: unknown }).destinationAmount ?? "");
  const destCurrency = String((data as { destinationCurrency?: unknown }).destinationCurrency ?? "").toUpperCase();
  const fechaHora    = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", hour12: false });

  await sendAdminWhatsApp(
    `✅ OmniPay Conduit — Pago COMPLETADO\n` +
    `Orden: ${orderId}\n` +
    `Fecha: ${fechaHora}\n` +
    (destAmount ? `Recibió: ${destAmount} ${destCurrency}\n` : "") +
    `Comprobante: ${receiptUrl}`,
  );

  // Send email to sender if contact info available from order data
  const senderEmail = String((data as { senderEmail?: unknown }).senderEmail ?? "");
  if (senderEmail) {
    const eT = emailStrings("es");
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#16a34a;margin:0 0 16px">${eT.completed_h2}</h2>
        <p>${eT.completed_sender("el destinatario")}</p>
        ${destAmount ? `<p>${eT.amount_received(destAmount, destCurrency)}</p>` : ""}
        <p><a href="${receiptUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${eT.receipt_cta}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
        <p style="color:#9ca3af;font-size:11px">OmniPay · ${eT.ref} ${orderId}</p>
      </div>`;
    await sendEmailNotification(senderEmail, eT.completed_subject, html);
  }
}
