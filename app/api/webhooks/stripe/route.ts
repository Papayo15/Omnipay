import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { parseCobrarV2Link, parseRemesaV2Link } from "@/lib/link";
import { decryptPayload } from "@/lib/accountcrypto";
import { getWiseAccountType, buildWiseAccountDetails } from "@/lib/wise-accounts";
import { executePaysend } from "@/lib/paysend";
import { executeNiumCard, executeNiumWallet } from "@/lib/nium";
import { sendPaymentNotification } from "@/lib/notify";
import { buildReceiptURL } from "@/lib/link";

// POST /api/webhooks/stripe
//
// REGLA 2 — Wise/Paysend/Thunes/Nium solo se disparan desde aquí, de servidor a servidor.
//            El cliente NUNCA inicia una transferencia directamente.
//
// Enrutamiento de rails (con fallback automático):
//
//   receiveMode = "card"
//     1. Paysend  si PAYSEND_API_KEY
//     2. Nium     si NIUM_API_KEY (fallback)
//
//   receiveMode = "wallet"
//     1. Thunes   si THUNES_CLIENT_ID
//     2. Nium     si NIUM_API_KEY (fallback)
//
//   receiveMode = "bank" (default)
//     → Wise siempre (CLABE, IBAN, ACH, PIX, UPI)

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

// ── Rail 1: Wise — cuentas bancarias (CLABE, IBAN, ACH, PIX, UPI) ─────────────

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

// ── Rail 2: Thunes — wallets móviles (M-Pesa, GCash, bKash, Orange Money…) ────

function thunesPayer(countryCode: string): string {
  const map: Record<string, string> = {
    // África del Este
    TZ: "mpesa_tz",   KE: "mpesa_ke",   ZM: "mpesa_zm",   MZ: "mpesa_mz",
    UG: "mtn_ug",     ZW: "ecocash",    ET: "telebirr",   RW: "mtn_rw",
    MW: "airtel_mw",
    // África del Oeste
    SN: "orange_money_sn", CI: "orange_money_ci", CM: "mtn_cm",
    BF: "orange_money_bf", ML: "orange_money_ml", GH: "mtn_gh",
    // Asia del Sur
    PK: "jazzcash",   BD: "bkash",
    // Sudeste Asiático
    PH: "gcash",      MM: "wave_mm",
    // China
    CN: "alipay",
    // Medio Oriente
    LB: "whish_lb",
  };
  return map[countryCode.toUpperCase()] ?? "bank_account";
}

async function executeThunes(
  clientId: string,
  secret: string,
  recipientName: string,
  walletId: string,       // teléfono E.164 o ID de wallet según país
  targetCountry: string,
  targetCurrency: string,
  sourceAmount: number,   // CAD
  targetAmount: number,   // en moneda destino (del metadata)
): Promise<string> {
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const [recipFirst = "Recipient", ...recipRest] = recipientName.split(" ");
  const recipLast = recipRest.join(" ") || recipFirst;

  const res = await fetch("https://api.thunes.com/v2/money-transfer/transactions", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: crypto.randomUUID(),
      source:      { amount: sourceAmount, currency: "CAD" },
      destination: {
        amount:  targetAmount,
        currency: targetCurrency,
        country:  targetCountry,
        service:  "WALLET",
        payer:    { slug: thunesPayer(targetCountry) },
      },
      credit_party_identifier: { msisdn: walletId },
      sender:      { lastname: "Sender",    firstname: "OmniPay", address: { country: "CA" } },
      beneficiary: { lastname: recipLast,   firstname: recipFirst },
    }),
  });
  const data = await res.json() as { id?: string | number; message?: string };
  if (!res.ok || !data.id) throw new Error(`Thunes: ${data.message ?? res.status}`);
  return String(data.id);
}

// ── Payout mode dinámico — protege el límite mensual de la tarjeta Wise ──────
//
// La tarjeta Visa Wise Canada tiene un límite de ~$55,000 CAD/mes en Instant Payouts.
// Si el volumen acumulado del mes más la transacción actual lo alcanza → STANDARD.
// Fines de semana → forzar INSTANT (los bancos no procesan STANDARD el sábado/domingo).
// En días hábiles → respetar NEXT_PUBLIC_PAYOUT_MODE como estrategia base.

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
    return 0; // en caso de error no bloquear — el replenishment sigue con el modo por defecto
  }
}

async function determinarModoPayout(stripe: Stripe, montoTransaccionCAD: number): Promise<"INSTANT" | "STANDARD"> {
  const limiteMensualWise      = 55_000; // CAD — límite tarjeta Wise Canada
  const volumenConsumidoEsteMes = await obtenerVolumenMensualAcumulado(stripe);

  // Regla 1: Proteger límite mensual de la tarjeta Wise
  if (volumenConsumidoEsteMes + montoTransaccionCAD >= limiteMensualWise) {
    console.log(`[webhook] Límite Wise casi alcanzado (${(volumenConsumidoEsteMes + montoTransaccionCAD).toFixed(0)}/${limiteMensualWise} CAD). Replenishment → STANDARD.`);
    return "STANDARD";
  }

  // Regla 2: Forzar INSTANT en fines de semana (bancos no procesan STANDARD Sáb/Dom)
  const dia = new Date().getDay(); // 0 = Dom, 6 = Sáb
  if (dia === 0 || dia === 6) return "INSTANT";

  // Regla 3: Estrategia base definida por variable de entorno
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

    // REGLA 3: Reensamblar token con ciphertext unificado
    const token    = t1 + (meta.t2 ?? "");
    const sigHmac  = meta.sig ?? "";
    const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const stripe     = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
    const piId       = String(pi?.id ?? "");
    const type       = meta.type ?? "cobro";

    try {
      let recipientAccount: string;
      let receiveMode:      string;
      let recipientPhone:   string;
      let senderPhone:      string;
      let recipientName:    string;
      let targetCurrency:   string;
      let targetCountry:    string;
      let cadAmount:        number;
      let targetAmount:     number;

      if (type === "remesa") {
        const payload = await parseRemesaV2Link(token, sigHmac, linkSecret);
        if (!payload) { console.warn(`[webhook] Token remesa inválido PI ${piId}`); return NextResponse.json({ received: true }); }

        const decrypted  = await decryptPayload(payload.encryptedPayload);
        recipientAccount = decrypted.account;
        receiveMode      = decrypted.receiveMode ?? "bank";
        recipientPhone   = decrypted.recipientPhone ?? "";
        senderPhone      = decrypted.senderPhone    ?? "";
        recipientName    = payload.recipientName;
        targetCurrency   = payload.receiveCurrency;
        targetCountry    = payload.targetCountry;
        cadAmount        = parseFloat(meta.cad_amount ?? "0");
        targetAmount     = payload.receiveAmount;
      } else {
        const payload = await parseCobrarV2Link(token, sigHmac, linkSecret);
        if (!payload) { console.warn(`[webhook] Token cobro inválido PI ${piId}`); return NextResponse.json({ received: true }); }

        const decrypted  = await decryptPayload(payload.encryptedPayload);
        recipientAccount = decrypted.account;
        receiveMode      = "bank"; // cobros siempre a cuenta bancaria
        recipientPhone   = decrypted.recipientPhone ?? "";
        senderPhone      = decrypted.senderPhone    ?? "";
        recipientName    = payload.recipientName;
        targetCurrency   = payload.currency;
        targetCountry    = meta.target_country ?? "MX";
        cadAmount        = payload.amount;
        targetAmount     = payload.amount;
      }

      if (!recipientAccount) {
        console.error(`[webhook] Sin cuenta para PI ${piId}`);
        return NextResponse.json({ received: true });
      }

      // ── Selección de rail con fallback automático ────────────────────────
      //
      //  receiveMode  │  Rail 1 (preferido)   │  Rail 2 (fallback)  │  Rail 3 (base)
      //  ─────────────┼──────────────────────┼────────────────────┼──────────────────
      //  "card"       │  Paysend              │  Nium               │  Wise
      //  "wallet"     │  Thunes               │  Nium               │  Wise
      //  "bank"       │  Wise                 │  —                  │  —
      //
      // Activación automática: si la credencial del rail preferido no está configurada,
      // el sistema intenta el siguiente. El receptor nunca nota el cambio de proveedor.

      let txId: string;
      let railLabel: string;

      if (receiveMode === "card") {
        if (process.env.PAYSEND_API_KEY) {
          // ── Rail 1: Paysend — Visa Direct / Mastercard Send / UnionPay ──────
          txId = await executePaysend(
            process.env.PAYSEND_API_KEY,
            recipientName,
            recipientAccount,
            targetCountry,
            targetCurrency,
            cadAmount,
            "OmniPay",
          );
          railLabel = "Paysend";
        } else if (process.env.NIUM_API_KEY && process.env.NIUM_CLIENT_HASH_ID) {
          // ── Rail 2: Nium card — fallback cuando Paysend no está configurado ─
          txId = await executeNiumCard(
            process.env.NIUM_API_KEY,
            process.env.NIUM_CLIENT_HASH_ID,
            recipientName,
            recipientAccount,
            targetCountry,
            targetCurrency,
            cadAmount,
          );
          railLabel = "Nium";
        } else {
          // ── Rail 3: Wise — ningún proveedor de tarjeta configurado aún ──────
          txId = await executeWise(
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
          railLabel = "Wise";
        }

      } else if (receiveMode === "wallet") {
        if (process.env.THUNES_CLIENT_ID && process.env.THUNES_SECRET) {
          // ── Rail 1: Thunes — M-Pesa, GCash, bKash, Orange Money… ───────────
          txId = await executeThunes(
            process.env.THUNES_CLIENT_ID,
            process.env.THUNES_SECRET,
            recipientName,
            recipientAccount,
            targetCountry,
            targetCurrency,
            cadAmount,
            targetAmount,
          );
          railLabel = "Thunes";
        } else if (process.env.NIUM_API_KEY && process.env.NIUM_CLIENT_HASH_ID) {
          // ── Rail 2: Nium wallet — fallback cuando Thunes no está configurado ─
          txId = await executeNiumWallet(
            process.env.NIUM_API_KEY,
            process.env.NIUM_CLIENT_HASH_ID,
            recipientName,
            recipientAccount,
            targetCountry,
            targetCurrency,
            cadAmount,
          );
          railLabel = "Nium";
        } else {
          // ── Rail 3: Wise — ningún proveedor de wallet configurado aún ───────
          txId = await executeWise(
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
          railLabel = "Wise";
        }

      } else {
        // ── receiveMode = "bank" — siempre Wise ──────────────────────────────
        txId = await executeWise(
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
        railLabel = "Wise";
      }

      // ── Comprobante + SMS ─────────────────────────────────────────────────
      const receiptUrl = await buildReceiptURL(
        { id: txId, a: cadAmount, c: targetCurrency, n: recipientName, ts: Date.now(), tt: type },
        appUrl, linkSecret,
      );
      await Promise.allSettled([
        recipientPhone ? sendPaymentNotification(recipientPhone, receiptUrl, cadAmount, targetCurrency, recipientName) : Promise.resolve(),
        senderPhone    ? sendPaymentNotification(senderPhone,    receiptUrl, cadAmount, targetCurrency, recipientName) : Promise.resolve(),
      ]);

      // ── Reposición automática del float Wise ──────────────────────────────
      // Stripe hace un Instant Payout a la tarjeta Visa de Wise Canada conectada
      // en el dashboard de Stripe (Settings → Bank accounts & debit cards).
      // El dinero llega a Wise en minutos, sin mover nada manualmente.
      // Fire-and-forget: si falla, el float se repone en el siguiente ciclo manual.
      const piObj = await stripe.paymentIntents.retrieve(piId);
      const chargedAmount = piObj.amount; // en centavos
      determinarModoPayout(stripe, chargedAmount / 100).then((modo) => {
        stripe.payouts.create({
          amount:               chargedAmount,
          currency:             piObj.currency,
          method:               modo === "INSTANT" ? "instant" : "standard",
          statement_descriptor: "OMNIPAY_REPLEN",
        }).catch((e: Error) => console.warn(`[webhook] Replenishment (${modo}) failed:`, e.message));
      }).catch((e: Error) => console.warn("[webhook] determinarModoPayout failed:", e.message));

      console.log(`[webhook] ${railLabel} TX ${txId} — PI ${piId} — replenishment enqueued`);
      return NextResponse.json({ received: true, txId, rail: railLabel });

    } catch (err) {
      const e = err as Error & { code?: string };
      console.error(`[webhook] Error PI ${piId}:`, e.message, e.code);

      // Error permanente → reembolso + 200 (Stripe NO reintenta)
      const PERMANENT_ERRORS = ["INVALID_ACCOUNT", "CURRENCY_UNSUPPORTED", "CARD_NOT_ELIGIBLE", "CARD_NOT_FOUND", "WALLET_NOT_FOUND"];
      if (PERMANENT_ERRORS.includes(e.code ?? "")) {
        try { await (new Stripe(process.env.STRIPE_SECRET_KEY ?? "")).refunds.create({ payment_intent: piId }); }
        catch (re) { console.error("[webhook] Refund failed:", re); }
        return NextResponse.json({ received: true, refunded: true, reason: e.code });
      }

      // Error transitorio → 500 para que Stripe reintente (hasta 72h)
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
