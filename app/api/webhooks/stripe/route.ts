import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { parseCobrarV2Link, parseRemesaV2Link } from "@/lib/link";
import { decryptPayload } from "@/lib/accountcrypto";
import { getWiseAccountType, buildWiseAccountDetails } from "@/lib/wise-accounts";
import { sendPaymentNotification, sendAdminWhatsApp } from "@/lib/notify";
import { buildReceiptURL } from "@/lib/link";

// POST /api/webhooks/stripe
//
// REGLA 2 — Wise solo se dispara desde aquí, de servidor a servidor.
//            El cliente NUNCA inicia una transferencia directamente.
//
// Rail único B2B: Wise → CLABE, IBAN, ACH, PIX, UPI (170+ países)
// Los rails de tarjeta (Paysend/NIUM) y wallet (Thunes) fueron eliminados.
// El P2P usa su propio webhook en /api/v1/p2p/webhook (Ramp → Bitso → SPEI).

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

// ── Rail único B2B: Wise — cuentas bancarias (CLABE, IBAN, ACH, PIX, UPI) ────

async function executeWise(
  profileId: string,
  apiKey: string,
  recipientName: string,
  recipientAccount: string,
  targetCountry: string,
  targetCurrency: string,
  sourceAmount: number,
  senderPhone: string,
  recipientPhone: string,
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

// ── Payout mode dinámico — protege el límite mensual de la tarjeta Wise ──────

async function obtenerVolumenMensualAcumulado(stripe: Stripe): Promise<number> {
  try {
    const ahora       = new Date();
    const inicioDeMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioUnix  = Math.floor(inicioDeMes.getTime() / 1000);
    let total         = 0;
    let hasMore       = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.PaymentIntentListParams = {
        created: { gte: inicioUnix },
        limit:   100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      };
      const list = await stripe.paymentIntents.list(params);
      for (const pi of list.data) {
        if (pi.status === "succeeded" && pi.currency === "cad") {
          total += pi.amount / 100;
        }
      }
      hasMore = list.has_more;
      if (list.data.length > 0) startingAfter = list.data[list.data.length - 1].id;
    }
    return total;
  } catch (e) {
    console.warn("[webhook] obtenerVolumenMensualAcumulado error:", e);
    return 0;
  }
}

async function determinarModoPayout(stripe: Stripe, montoTransaccionCAD: number): Promise<"INSTANT" | "STANDARD"> {
  const limiteMensualWise       = 55_000;
  const volumenConsumidoEsteMes = await obtenerVolumenMensualAcumulado(stripe);

  if (volumenConsumidoEsteMes + montoTransaccionCAD >= limiteMensualWise) {
    console.log(`[webhook] Límite Wise casi alcanzado (${(volumenConsumidoEsteMes + montoTransaccionCAD).toFixed(0)}/${limiteMensualWise} CAD). Replenishment → STANDARD.`);
    return "STANDARD";
  }

  const dia = new Date().getDay();
  if (dia === 0 || dia === 6) return "INSTANT";

  return (process.env.NEXT_PUBLIC_PAYOUT_MODE as "INSTANT" | "STANDARD" | undefined) ?? "INSTANT";
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

  // ── Evento legacy: checkout.session.completed ─────────────────────────────
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

  // ── Evento v2: payment_intent.succeeded ───────────────────────────────────
  if (event.type === "payment_intent.succeeded") {
    const pi   = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
    const meta = pi?.metadata as Record<string, string> | undefined;

    if (!meta) return NextResponse.json({ received: true });

    const t1 = meta.t1 ?? "";
    if (!t1) return NextResponse.json({ received: true });

    const token      = t1 + (meta.t2 ?? "");
    const sigHmac    = meta.sig ?? "";
    const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const stripe     = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
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
        if (!payload) { console.warn(`[webhook] Token remesa inválido PI ${piId}`); return NextResponse.json({ received: true }); }

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
        if (!payload) { console.warn(`[webhook] Token cobro inválido PI ${piId}`); return NextResponse.json({ received: true }); }

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
        console.error(`[webhook] Sin cuenta para PI ${piId}`);
        return NextResponse.json({ received: true });
      }

      // ── Alerta admin si el float está bajo ───────────────────────────────
      if (meta.payout_delayed === "true") {
        const cadAmt = parseFloat(meta.cad_amount ?? meta.amount ?? "0");
        sendAdminWhatsApp(
          `⚠️ OmniPay float bajo\nPago de $${cadAmt.toFixed(2)} CAD en modo diferido.\nReponer fondos en Wise urgente.`
        ).catch(() => {});
      }

      // ── Reposición del float — dispara ANTES de intentar Wise ────────────
      const piObj = await stripe.paymentIntents.retrieve(piId);
      determinarModoPayout(stripe, piObj.amount / 100).then((modo) => {
        stripe.payouts.create({
          amount:               piObj.amount,
          currency:             piObj.currency,
          method:               modo === "INSTANT" ? "instant" : "standard",
          statement_descriptor: "OMNIPAY_REPLEN",
        }).catch((e: Error) => console.warn(`[webhook] Replenishment (${modo}) failed:`, e.message));
      }).catch((e: Error) => console.warn("[webhook] determinarModoPayout failed:", e.message));

      // ── Wise — rail único B2B ─────────────────────────────────────────────
      const txId = await executeWise(
        process.env.WISE_PROFILE_ID ?? "",
        process.env.WISE_API_KEY    ?? "",
        recipientName,
        recipientAccount,
        targetCountry,
        targetCurrency,
        cadAmount,
        senderPhone,
        recipientPhone,
      );

      // ── Comprobante + notificación ────────────────────────────────────────
      const receiptUrl = await buildReceiptURL(
        { id: txId, a: cadAmount, c: targetCurrency, n: recipientName, ts: Date.now(), tt: type },
        appUrl, linkSecret,
      );
      await Promise.allSettled([
        recipientPhone ? sendPaymentNotification(recipientPhone, receiptUrl, cadAmount, targetCurrency, recipientName) : Promise.resolve(),
        senderPhone    ? sendPaymentNotification(senderPhone,    receiptUrl, cadAmount, targetCurrency, recipientName) : Promise.resolve(),
      ]);

      console.log(`[webhook] Wise TX ${txId} — PI ${piId}`);
      return NextResponse.json({ received: true, txId, rail: "Wise" });

    } catch (err) {
      const e = err as Error & { code?: string };
      console.error(`[webhook] Error PI ${piId}:`, e.message, e.code);

      const PERMANENT_ERRORS = ["INVALID_ACCOUNT", "CURRENCY_UNSUPPORTED"];
      if (PERMANENT_ERRORS.includes(e.code ?? "")) {
        try { await (new Stripe(process.env.STRIPE_SECRET_KEY ?? "")).refunds.create({ payment_intent: piId }); }
        catch (re) { console.error("[webhook] Refund failed:", re); }
        return NextResponse.json({ received: true, refunded: true, reason: e.code });
      }

      return NextResponse.json({ error: e.message }, { status: 503 });
    }
  }

  return NextResponse.json({ received: true });
}
