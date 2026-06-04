import { NextRequest, NextResponse } from "next/server";
import { sendPaymentNotification } from "@/lib/notify";
import { buildReceiptURL } from "@/lib/link";

export const runtime = "edge";

// POST /api/webhooks/stripe
// Evento: checkout.session.completed
// Genera comprobante FIRMADO con LINK_SECRET y envía SMS a comercio y cliente.

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const enc   = new TextEncoder();
    const parts = sigHeader.split(",");
    const t     = parts.find((p) => p.startsWith("t="))?.slice(2)  ?? "";
    const v1    = parts.find((p) => p.startsWith("v1="))?.slice(3) ?? "";
    const key   = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig   = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
    const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (computed.length !== v1.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get("stripe-signature") ?? "";
  const secret  = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const valid = await verifyStripeSignature(rawBody, sig, secret);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session      = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  const meta         = session?.metadata as Record<string, unknown> | undefined;
  const amount       = Number(session?.amount_total ?? 0) / 100;
  const currency     = String(session?.currency ?? "mxn").toUpperCase();
  const clientPhone  = String(meta?.client_phone   ?? "");
  const merchantPhone = String(meta?.merchant_phone ?? "");
  const merchantName  = String(meta?.merchant_name  ?? "Comercio");
  const sessionId     = String(session?.id ?? "");
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const linkSecret    = process.env.LINK_SECRET ?? "";

  // Comprobante firmado con HMAC — previene falsificación
  const receiptUrl = await buildReceiptURL(
    { id: sessionId, a: amount, c: currency, n: merchantName, ts: Date.now(), tt: "cobro" },
    appUrl,
    linkSecret
  );

  const promises: Promise<void>[] = [];
  if (clientPhone)  promises.push(sendPaymentNotification(clientPhone,  receiptUrl, amount, currency, merchantName));
  if (merchantPhone && merchantPhone !== clientPhone)
    promises.push(sendPaymentNotification(merchantPhone, receiptUrl, amount, currency, merchantName));
  await Promise.allSettled(promises);

  return NextResponse.json({ received: true });
}
