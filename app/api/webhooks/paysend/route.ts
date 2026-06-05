import { NextRequest, NextResponse } from "next/server";

// POST /api/webhooks/paysend
// Paysend Enterprise notifica el estado final de cada payout via webhook.
//
// TODO when credentials arrive: confirm from Paysend Enterprise docs:
//   - Exact event types (e.g., "COMPLETED", "FAILED", "REVERSED")
//   - Signature header name and verification method
//   - Payload schema for extracting transfer ID, status, and reference fields
//
// Configurar en el portal Paysend → Webhooks → URL: https://<domain>/api/webhooks/paysend

interface PaysendWebhookEvent {
  event?: string;
  status?: string;
  transferId?: string;
  id?: string;
  amount?: number;
  currency?: string;
  recipientName?: string;
  errorCode?: string;
  metadata?: Record<string, string>;
}

async function sendSMS(to: string, body: string) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return;
  const phone = to.startsWith("+") ? to : `+${to.replace(/\D/g, "")}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, From: from, Body: body }).toString(),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  try {
    const event = await req.json() as PaysendWebhookEvent;
    const status = (event.event ?? event.status ?? "").toUpperCase();

    // Extract phones from metadata if Paysend passes them through
    const recipientPhone = event.metadata?.recipientPhone ?? "";
    const senderPhone    = event.metadata?.senderPhone    ?? "";
    const amount   = event.amount   ?? 0;
    const currency = event.currency ?? "";

    if (status === "COMPLETED" || status === "SUCCESS") {
      await Promise.allSettled([
        sendSMS(recipientPhone,
          `✅ OmniPay: Tu dinero llegó a tu tarjeta. ${amount} ${currency} depositado.`),
        sendSMS(senderPhone,
          `✅ OmniPay: Tu remesa fue entregada exitosamente a la tarjeta del receptor.`),
      ]);
    } else if (status === "FAILED" || status === "REVERSED") {
      await sendSMS(senderPhone,
        `⚠️ OmniPay: Tu remesa no pudo completarse. Contacta soporte si no recibes el reembolso en 5 días.`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Paysend webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
