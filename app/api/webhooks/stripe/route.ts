// POST /api/webhooks/stripe
//
// B2B flow (two-step):
//   Step 1 — payment_intent.succeeded:
//     Parse token → extract recipient details → store in Redis as PENDING
//     Send confirmation to sender: "tu pago llegará en 3-4 días hábiles"
//
//   Step 2 — payout.paid (Stripe deposited funds into Wise):
//     Scan all PENDING orders in Redis older than 2 days
//     Execute Wise transfer for each → send completion SMS → delete from Redis
//     Permanent errors (invalid account) → refund + delete from Redis
//     Transient errors → leave in Redis, retry on next payout.paid

import { NextRequest, NextResponse }                          from "next/server";
import Stripe                                                  from "stripe";
import { parseCobrarV2Link, parseRemesaV2Link, buildReceiptURL } from "@/lib/link";
import { decryptPayload }                                      from "@/lib/accountcrypto";
import { getWiseAccountType, buildWiseAccountDetails }         from "@/lib/wise-accounts";
import { sendPaymentNotification, sendAdminWhatsApp }          from "@/lib/notify";
import { getRedis }                                            from "@/lib/redis";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingB2BOrder {
  piId:             string;
  recipientAccount: string;
  recipientPhone:   string;
  senderPhone:      string;
  recipientName:    string;
  targetCurrency:   string;
  targetCountry:    string;
  cadAmount:        number;
  type:             string;
  createdAt:        number;
}

// ── Stripe signature verification ─────────────────────────────────────────────

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

// ── Wise payout ───────────────────────────────────────────────────────────────

async function executeWise(
  profileId:        string,
  apiKey:           string,
  recipientName:    string,
  recipientAccount: string,
  targetCountry:    string,
  targetCurrency:   string,
  sourceAmount:     number,
  senderPhone:      string,
  recipientPhone:   string,
): Promise<string> {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const accountRes = await fetch("https://api.wise.com/v1/accounts", {
    method: "POST", headers,
    body: JSON.stringify({
      profile:           profileId,
      accountHolderName: recipientName,
      currency:          targetCurrency,
      type:              getWiseAccountType(targetCountry),
      details:           buildWiseAccountDetails(targetCountry, recipientAccount),
    }),
  });
  const account = await accountRes.json() as { id?: number; errors?: Array<{ message: string }> };
  if (!accountRes.ok || !account.id) {
    const msg = account.errors?.[0]?.message ?? String(accountRes.status);
    if (accountRes.status === 422) throw Object.assign(new Error(msg), { code: "INVALID_ACCOUNT" });
    throw new Error(`Wise account: ${msg}`);
  }

  const quoteRes = await fetch(`https://api.wise.com/v3/profiles/${profileId}/quotes`, {
    method: "POST", headers,
    body: JSON.stringify({ sourceCurrency: "CAD", targetCurrency, sourceAmount }),
  });
  const quote = await quoteRes.json() as { id?: string; errors?: Array<{ message: string }> };
  if (!quoteRes.ok || !quote.id) {
    const msg = quote.errors?.[0]?.message ?? String(quoteRes.status);
    if (quoteRes.status === 422) throw Object.assign(new Error(msg), { code: "CURRENCY_UNSUPPORTED" });
    throw new Error(`Wise quote: ${msg}`);
  }

  const transferRes = await fetch("https://api.wise.com/v1/transfers", {
    method: "POST", headers,
    body: JSON.stringify({
      targetAccount:         account.id,
      quoteUuid:             quote.id,
      customerTransactionId: crypto.randomUUID(),
      details: { reference: `OP|r:${recipientPhone}|s:${senderPhone}`.slice(0, 50) },
    }),
  });
  const transfer = await transferRes.json() as { id?: number; errors?: Array<{ message: string }> };
  if (!transferRes.ok || !transfer.id) throw new Error(`Wise transfer: ${transfer.errors?.[0]?.message ?? transferRes.status}`);

  const fundRes = await fetch(
    `https://api.wise.com/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
    { method: "POST", headers, body: JSON.stringify({ type: "BALANCE" }) },
  );
  if (!fundRes.ok) {
    const e = await fundRes.json() as { errors?: Array<{ message: string }> };
    const msg = e.errors?.[0]?.message ?? String(fundRes.status);
    if (fundRes.status === 422) throw Object.assign(new Error(msg), { code: "INSUFFICIENT_FUNDS" });
    throw new Error(`Wise fund: ${msg}`);
  }

  return String(transfer.id);
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function storePendingOrder(order: PendingB2BOrder): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(`b2b:pending:${order.piId}`, JSON.stringify(order), { EX: 604800 }); // 7 days
  } catch (e) {
    console.error("[stripe/webhook] Redis store failed:", (e as Error).message);
  }
}

async function processPendingOrders(
  wiseApiKey:    string,
  wiseProfileId: string,
  appUrl:        string,
  linkSecret:    string,
): Promise<void> {
  let redis;
  try { redis = await getRedis(); }
  catch (e) { console.error("[stripe/webhook] Redis unavailable:", (e as Error).message); return; }

  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

  for await (const key of redis.scanIterator({ MATCH: "b2b:pending:*", COUNT: 100 })) {
    const k   = String(key);
    const raw = await redis.get(k);
    if (!raw) continue;

    let order: PendingB2BOrder;
    try { order = JSON.parse(raw) as PendingB2BOrder; }
    catch { await redis.del(k); continue; }

    // Skip orders newer than 2 days — may not be covered by this payout yet
    if (order.createdAt > twoDaysAgo) continue;

    try {
      const txId = await executeWise(
        wiseProfileId, wiseApiKey,
        order.recipientName,    order.recipientAccount,
        order.targetCountry,    order.targetCurrency,
        order.cadAmount,        order.senderPhone, order.recipientPhone,
      );

      await redis.del(k);

      const receiptUrl = await buildReceiptURL(
        { id: txId, a: order.cadAmount, c: order.targetCurrency, n: order.recipientName, ts: Date.now(), tt: order.type },
        appUrl, linkSecret,
      ).catch(() => `${appUrl}/resultado?ref=${txId}`);

      await Promise.allSettled([
        order.recipientPhone ? sendPaymentNotification(order.recipientPhone, receiptUrl, order.cadAmount, order.targetCurrency, order.recipientName) : Promise.resolve(),
        order.senderPhone    ? sendPaymentNotification(order.senderPhone,    receiptUrl, order.cadAmount, order.targetCurrency, order.recipientName) : Promise.resolve(),
        sendAdminWhatsApp(`✅ OmniPay B2B completado\nPI: ${order.piId}\nWise TX: ${txId}\nReceptor: ${order.recipientName}\nMonto: ${order.cadAmount} CAD → ${order.targetCurrency}`),
      ]);

      console.log(`[stripe/webhook] B2B OK — Wise TX ${txId} for PI ${order.piId}`);

    } catch (err) {
      const e = err as Error & { code?: string };
      console.error(`[stripe/webhook] Wise failed for PI ${order.piId}:`, e.message, e.code);

      const PERMANENT = ["INVALID_ACCOUNT", "CURRENCY_UNSUPPORTED"];
      if (PERMANENT.includes(e.code ?? "")) {
        await redis.del(k);
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          await stripe.refunds.create({ payment_intent: order.piId });
          await sendAdminWhatsApp(`🚨 OmniPay B2B — reembolsado\nPI: ${order.piId}\nMotivo: ${e.code}\nReceptor: ${order.recipientName}`);
        } catch (re) { console.error("[stripe/webhook] Refund failed:", re); }
      } else {
        // Transient error — leave in Redis, will retry on next payout.paid
        await sendAdminWhatsApp(`⚠️ OmniPay B2B — reintentará en próximo payout\nPI: ${order.piId}\nError: ${e.message}`);
      }
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get("stripe-signature") ?? "";
  const secret  = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const valid = await verifyStripeSignature(rawBody, sig, secret);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Legacy: checkout.session.completed (solo notificación) ───────────────
  if (event.type === "checkout.session.completed") {
    const session       = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
    const meta          = session?.metadata as Record<string, unknown> | undefined;
    const amount        = Number(session?.amount_total ?? 0) / 100;
    const currency      = String(session?.currency ?? "mxn").toUpperCase();
    const clientPhone   = String(meta?.client_phone   ?? "");
    const merchantPhone = String(meta?.merchant_phone ?? "");
    const merchantName  = String(meta?.merchant_name  ?? "Comercio");
    const sessionId     = String(session?.id ?? "");
    const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const linkSecret    = process.env.LINK_SECRET ?? "";

    const receiptUrl = await buildReceiptURL(
      { id: sessionId, a: amount, c: currency, n: merchantName, ts: Date.now(), tt: "cobro" },
      appUrl, linkSecret,
    );
    await Promise.allSettled([
      clientPhone   ? sendPaymentNotification(clientPhone,   receiptUrl, amount, currency, merchantName) : Promise.resolve(),
      merchantPhone && merchantPhone !== clientPhone
        ? sendPaymentNotification(merchantPhone, receiptUrl, amount, currency, merchantName) : Promise.resolve(),
    ]);
    return NextResponse.json({ received: true });
  }

  // ── Step 1: Pago confirmado → guardar en Redis, confirmar al cliente ──────
  if (event.type === "payment_intent.succeeded") {
    const pi   = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
    const meta = pi?.metadata as Record<string, string> | undefined;

    if (!meta?.t1) return NextResponse.json({ received: true });

    const token      = meta.t1 + (meta.t2 ?? "");
    const sigHmac    = meta.sig ?? "";
    const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
    const piId       = String(pi?.id ?? "");
    const type       = meta.type ?? "cobro";

    try {
      let recipientAccount: string;
      let recipientPhone:   string;
      let senderPhone:      string;
      let recipientName:    string;
      let targetCurrency:   string;
      let targetCountry:    string;
      let cadAmount:        number;

      if (type === "remesa") {
        const payload = await parseRemesaV2Link(token, sigHmac, linkSecret);
        if (!payload) { console.warn(`[stripe/webhook] Token remesa inválido PI ${piId}`); return NextResponse.json({ received: true }); }
        const decrypted  = await decryptPayload(payload.encryptedPayload);
        recipientAccount = decrypted.account;
        recipientPhone   = decrypted.recipientPhone ?? "";
        senderPhone      = decrypted.senderPhone    ?? "";
        recipientName    = payload.recipientName;
        targetCurrency   = payload.receiveCurrency;
        targetCountry    = payload.targetCountry;
        cadAmount        = parseFloat(meta.cad_amount ?? "0");
      } else {
        const payload = await parseCobrarV2Link(token, sigHmac, linkSecret);
        if (!payload) { console.warn(`[stripe/webhook] Token cobro inválido PI ${piId}`); return NextResponse.json({ received: true }); }
        const decrypted  = await decryptPayload(payload.encryptedPayload);
        recipientAccount = decrypted.account;
        recipientPhone   = decrypted.recipientPhone ?? "";
        senderPhone      = decrypted.senderPhone    ?? "";
        recipientName    = payload.recipientName;
        targetCurrency   = payload.currency;
        targetCountry    = meta.target_country ?? "MX";
        cadAmount        = payload.amount;
      }

      if (!recipientAccount) {
        console.error(`[stripe/webhook] Sin cuenta para PI ${piId}`);
        return NextResponse.json({ received: true });
      }

      // Guardar en Redis — se ejecutará cuando payout.paid llegue
      await storePendingOrder({
        piId, recipientAccount, recipientPhone, senderPhone,
        recipientName, targetCurrency, targetCountry, cadAmount, type,
        createdAt: Date.now(),
      });

      // Confirmar al cliente y al admin
      await Promise.allSettled([
        senderPhone ? sendPaymentNotification(
          senderPhone,
          "",
          cadAmount,
          "CAD",
          recipientName,
        ) : Promise.resolve(),
        sendAdminWhatsApp(
          `💳 OmniPay B2B — pago confirmado\n` +
          `PI: ${piId}\n` +
          `Receptor: ${recipientName} (${targetCountry})\n` +
          `Monto: ${cadAmount} CAD → ${targetCurrency}\n` +
          `Estado: PENDING PAYOUT (3-4 días hábiles)`,
        ),
      ]);

      console.log(`[stripe/webhook] PI ${piId} guardado en Redis — esperando payout.paid`);
      return NextResponse.json({ received: true, status: "PENDING_PAYOUT" });

    } catch (err) {
      const e = err as Error;
      console.error(`[stripe/webhook] Error PI ${piId}:`, e.message);
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
  }

  // ── Step 2: Stripe depositó en Wise → ejecutar todos los pendientes ───────
  if (event.type === "payout.paid") {
    const payout   = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
    const amount   = Number(payout?.amount ?? 0) / 100;
    const currency = String(payout?.currency ?? "").toUpperCase();

    console.log(`[stripe/webhook] payout.paid ${amount} ${currency} — ejecutando órdenes pendientes`);

    await sendAdminWhatsApp(
      `🏦 OmniPay — Stripe depositó en Wise\n${amount} ${currency}\nEjecutando pagos B2B pendientes...`,
    );

    await processPendingOrders(
      process.env.WISE_API_KEY     ?? "",
      process.env.WISE_PROFILE_ID  ?? "",
      process.env.NEXT_PUBLIC_APP_URL ?? "",
      process.env.LINK_SECRET      ?? "",
    );

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
