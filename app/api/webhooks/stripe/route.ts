// POST /api/webhooks/stripe
//
// REGLA DE ORO: cero datos personales almacenados.
// Redis guarda SOLO el token ya cifrado (AES-256) + metadatos no-PII.
// PII (nombre, cuenta, teléfono) existe únicamente en memoria durante la ejecución
// y se descarta inmediatamente — nunca toca Redis ni ningún otro almacén.
//
// B2B flow (two-step):
//   Step 1 — payment_intent.succeeded:
//     Descifrar en memoria → SMS de confirmación al emisor → descartar PII
//     Guardar en Redis: { piId, token_cifrado, sig, type, cadAmount, createdAt }
//
//   Step 2 — payout.paid (Stripe depositó en Wise):
//     Leer token cifrado de Redis → descifrar en memoria → ejecutar Wise → borrar de Redis
//     Errores permanentes → reembolso automático + borrar de Redis
//     Errores transitorios → dejar en Redis, reintentar en próximo payout.paid

import { NextRequest, NextResponse }                            from "next/server";
import Stripe                                                    from "stripe";
import { parseCobrarV2Link, parseRemesaV2Link, buildReceiptURL } from "@/lib/link";
import { decryptPayload }                                        from "@/lib/accountcrypto";
import { getWiseAccountType, buildWiseAccountDetails }           from "@/lib/wise-accounts";
import { sendB2BPendingNotification, sendPaymentNotification, sendAdminWhatsApp } from "@/lib/notify";
import { getRedis }                                              from "@/lib/redis";

// ── Tipos ─────────────────────────────────────────────────────────────────────

// Solo metadatos no-PII — el token va cifrado, nadie puede leerlo sin LINK_SECRET
interface PendingB2BToken {
  piId:         string;   // ID de Stripe — identificador técnico, no dato personal
  token:        string;   // AES-256-GCM cifrado — opaque blob
  sig:          string;   // HMAC del token para validación
  type:         string;   // "cobro" | "remesa"
  principalCAD: number;   // monto PRINCIPAL a enviar al receptor (sin fees OmniPay/Wise/Stripe)
  createdAt:    number;
}

// ── Stripe signature ──────────────────────────────────────────────────────────

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

// ── Redis — solo token cifrado, sin PII ──────────────────────────────────────

async function storePendingToken(entry: PendingB2BToken): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(`b2b:pending:${entry.piId}`, JSON.stringify(entry), { EX: 604800 }); // 7 días
  } catch (e) {
    console.error("[stripe/webhook] Redis store failed:", (e as Error).message);
  }
}

async function processPendingOrders(
  wiseApiKey:    string,
  wiseProfileId: string,
  linkSecret:    string,
  appUrl:        string,
): Promise<void> {
  let redis;
  try { redis = await getRedis(); }
  catch (e) { console.error("[stripe/webhook] Redis unavailable:", (e as Error).message); return; }

  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

  for await (const key of redis.scanIterator({ MATCH: "b2b:pending:*", COUNT: 100 })) {
    const k   = String(key);
    const raw = await redis.get(k);
    if (!raw) continue;

    let entry: PendingB2BToken;
    try { entry = JSON.parse(raw) as PendingB2BToken; }
    catch { await redis.del(k); continue; }

    if (entry.createdAt > twoDaysAgo) continue; // demasiado reciente, esperar

    // ── Descifrar token en memoria — PII nunca sale de este scope ────────────
    try {
      let recipientName:    string;
      let recipientAccount: string;
      let recipientPhone:   string;
      let senderPhone:      string;
      let targetCurrency:   string;
      let targetCountry:    string;

      if (entry.type === "remesa") {
        const payload = await parseRemesaV2Link(entry.token, entry.sig, linkSecret);
        if (!payload) { await redis.del(k); continue; }
        const dec     = await decryptPayload(payload.encryptedPayload);
        recipientName    = payload.recipientName;
        recipientAccount = dec.account;
        recipientPhone   = dec.recipientPhone ?? "";
        senderPhone      = dec.senderPhone    ?? "";
        targetCurrency   = payload.receiveCurrency;
        targetCountry    = payload.targetCountry;
      } else {
        const payload = await parseCobrarV2Link(entry.token, entry.sig, linkSecret);
        if (!payload) { await redis.del(k); continue; }
        const dec     = await decryptPayload(payload.encryptedPayload);
        recipientName    = payload.recipientName;
        recipientAccount = dec.account;
        recipientPhone   = dec.recipientPhone ?? "";
        senderPhone      = dec.senderPhone    ?? "";
        targetCurrency   = payload.currency;
        targetCountry    = (JSON.parse(raw) as { targetCountry?: string }).targetCountry ?? "MX";
      }

      // ── Ejecutar Wise ─────────────────────────────────────────────────────
      const txId = await executeWise(
        wiseProfileId, wiseApiKey,
        recipientName, recipientAccount,
        targetCountry, targetCurrency,
        entry.principalCAD,  // solo el principal — fees ya quedaron en Wise para OmniPay
        senderPhone, recipientPhone,
      );

      // Borrar de Redis ANTES de notificar — PII ya no necesaria en Redis
      await redis.del(k);

      // Notificaciones y comprobante
      const receiptUrl = await buildReceiptURL(
        { id: txId, a: entry.principalCAD, c: targetCurrency, n: recipientName, ts: Date.now(), tt: entry.type },
        appUrl, linkSecret,
      ).catch(() => `${appUrl}/resultado?ref=${txId}`);

      await Promise.allSettled([
        recipientPhone ? sendPaymentNotification(recipientPhone, receiptUrl, entry.principalCAD, targetCurrency, recipientName) : Promise.resolve(),
        senderPhone    ? sendPaymentNotification(senderPhone,    receiptUrl, entry.principalCAD, targetCurrency, recipientName) : Promise.resolve(),
        sendAdminWhatsApp(`✅ OmniPay B2B completado\nPI: ${entry.piId}\nWise TX: ${txId}\nPrincipal: ${entry.principalCAD} CAD → ${targetCurrency}`),
      ]);

      // PII (recipientName, recipientAccount, phones) se descarta aquí — fin del scope
      console.log(`[stripe/webhook] B2B OK — Wise TX ${txId} PI ${entry.piId}`);

    } catch (err) {
      const e = err as Error & { code?: string };
      console.error(`[stripe/webhook] Wise failed PI ${entry.piId}:`, e.message, e.code);

      const PERMANENT = ["INVALID_ACCOUNT", "CURRENCY_UNSUPPORTED"];
      if (PERMANENT.includes(e.code ?? "")) {
        await redis.del(k);
        try {
          await new Stripe(process.env.STRIPE_SECRET_KEY ?? "").refunds.create({ payment_intent: entry.piId });
          await sendAdminWhatsApp(`🚨 OmniPay B2B reembolsado\nPI: ${entry.piId}\nMotivo: ${e.code}`);
        } catch (re) { console.error("[stripe/webhook] Refund failed:", re); }
      } else {
        await sendAdminWhatsApp(`⚠️ OmniPay B2B — reintentará\nPI: ${entry.piId}\nError: ${e.message}`);
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
  if (!await verifyStripeSignature(rawBody, sig, secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Legacy: checkout.session.completed ───────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session     = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
    const meta        = session?.metadata as Record<string, unknown> | undefined;
    const amount      = Number(session?.amount_total ?? 0) / 100;
    const currency    = String(session?.currency ?? "mxn").toUpperCase();
    const clientPhone = String(meta?.client_phone   ?? "");
    const merchPhone  = String(meta?.merchant_phone ?? "");
    const merchName   = String(meta?.merchant_name  ?? "Comercio");
    const sessionId   = String(session?.id ?? "");
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const linkSecret  = process.env.LINK_SECRET ?? "";

    const receiptUrl = await buildReceiptURL(
      { id: sessionId, a: amount, c: currency, n: merchName, ts: Date.now(), tt: "cobro" },
      appUrl, linkSecret,
    );
    await Promise.allSettled([
      clientPhone ? sendPaymentNotification(clientPhone, receiptUrl, amount, currency, merchName) : Promise.resolve(),
      merchPhone && merchPhone !== clientPhone
        ? sendPaymentNotification(merchPhone, receiptUrl, amount, currency, merchName) : Promise.resolve(),
    ]);
    return NextResponse.json({ received: true });
  }

  // ── Step 1: Pago confirmado → guardar token cifrado, confirmar al emisor ──
  if (event.type === "payment_intent.succeeded") {
    const pi         = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
    const meta       = pi?.metadata as Record<string, string> | undefined;
    if (!meta?.t1) return NextResponse.json({ received: true });

    const token      = meta.t1 + (meta.t2 ?? "");
    const sigHmac    = meta.sig ?? "";
    const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
    const piId       = String(pi?.id ?? "");
    const type       = meta.type ?? "cobro";

    try {
      // Descifrar una vez en memoria para:
      //   1. Obtener principalCAD (monto a enviar al receptor, SIN fees)
      //   2. Obtener senderPhone para SMS de confirmación
      // PII existe solo en este bloque y se descarta al salir — nunca va a Redis
      let senderPhone   = "";
      let recipientName = "";
      let principalCAD  = 0;

      try {
        if (type === "remesa") {
          const p = await parseRemesaV2Link(token, sigHmac, linkSecret);
          if (p) {
            const d       = await decryptPayload(p.encryptedPayload);
            senderPhone   = d.senderPhone ?? "";
            recipientName = p.recipientName;
            // meta.cad_amount = lo que el emisor debe depositar en CAD al receptor
            principalCAD  = parseFloat(meta.cad_amount ?? "0");
          }
        } else {
          const p = await parseCobrarV2Link(token, sigHmac, linkSecret);
          if (p) {
            const d       = await decryptPayload(p.encryptedPayload);
            senderPhone   = d.senderPhone ?? "";
            recipientName = p.recipientName;
            principalCAD  = p.amount; // monto del link = lo que recibe el receptor
          }
        }
      } catch { /* non-critical */ }

      if (!principalCAD) {
        console.error(`[stripe/webhook] No se pudo determinar principalCAD para PI ${piId}`);
        return NextResponse.json({ received: true });
      }

      // Confirmar al emisor — PII usado aquí y descartado
      await Promise.allSettled([
        senderPhone
          ? sendB2BPendingNotification(senderPhone, recipientName, principalCAD, "CAD", piId.slice(-8))
          : Promise.resolve(),
        sendAdminWhatsApp(`💳 OmniPay B2B confirmado\nPI: ${piId}\nPrincipal: ${principalCAD} CAD\nEntrega: 3-4 días hábiles`),
      ]);
      // ── senderPhone, recipientName descartados aquí ───────────────────────

      // Guardar en Redis: SOLO token cifrado + principal (número, no PII)
      await storePendingToken({ piId, token, sig: sigHmac, type, principalCAD, createdAt: Date.now() });

      console.log(`[stripe/webhook] PI ${piId} en cola — esperando payout.paid`);
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

    console.log(`[stripe/webhook] payout.paid ${amount} ${currency} — procesando cola B2B`);
    await sendAdminWhatsApp(`🏦 Stripe depositó en Wise: ${amount} ${currency}\nEjecutando pagos pendientes...`);

    await processPendingOrders(
      process.env.WISE_API_KEY        ?? "",
      process.env.WISE_PROFILE_ID     ?? "",
      process.env.LINK_SECRET         ?? "",
      process.env.NEXT_PUBLIC_APP_URL ?? "",
    );

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
