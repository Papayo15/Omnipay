import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { parseRemesaLink, buildReceiptURL } from "@/lib/link";
import { selectRemesaRail } from "@/constants/remesa-rails";
import { getWiseAccountType, buildWiseAccountDetails } from "@/lib/wise-accounts";

// POST /api/remesa/execute
// El receptor confirma su método de cobro. Este endpoint:
//   1. Verifica HMAC del link (stateless)
//   2. Verifica que el emisor pagó en Stripe
//   3. Dispersa vía Paysend (push a tarjeta 16 dígitos) o Wise (cuenta bancaria)
//   4. Repone balances Paysend + Wise via Stripe Instant Payout (asíncrono)
//   5. Genera comprobante firmado HMAC

// ── Balance checks ─────────────────────────────────────────────────────────────

async function getWiseCADBalance(profileId: string, apiKey: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const balances = await res.json() as Array<{ currency: string; amount: { value: number } }>;
    return balances.find((b) => b.currency === "CAD")?.amount?.value ?? 0;
  } catch { return 0; }
}

// ── Wise transfer ─────────────────────────────────────────────────────────────

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
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

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

  const reference = `OP|r:${recipientPhone}|s:${senderPhone}`.slice(0, 50);
  const transferRes = await fetch("https://api.wise.com/v1/transfers", {
    method: "POST", headers,
    body: JSON.stringify({
      targetAccount:         account.id,
      quoteUuid:             quote.id,
      customerTransactionId: crypto.randomUUID(),
      details: { reference },
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

// ── Thunes transfer (wallets móviles — fallback cuando Paysend no llega) ───────

function thunesPayer(countryCode: string): string {
  const map: Record<string, string> = {
    TZ: "mpesa_tz",   ZM: "mpesa_zm",  MZ: "mpesa_mz",
    UG: "mtn_ug",     ZW: "ecocash",   ET: "telebirr",
    SN: "orange_money_sn", CI: "orange_money_ci", CM: "mtn_cm",
    BF: "orange_money_bf", ML: "orange_money_ml",
    LB: "whish_lb",   MW: "airtel_mw",
  };
  return map[countryCode.toUpperCase()] ?? "bank_account";
}

async function executeThunes(
  clientId: string,
  secret: string,
  recipientName: string,
  recipientAccount: string,
  targetCountry: string,
  targetCurrency: string,
  sourceAmount: number,
  targetAmount: number,
  senderName: string,
): Promise<string> {
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const [senderFirst = "Sender", ...senderRest] = senderName.split(" ");
  const senderLast = senderRest.join(" ") || senderFirst;
  const [recipFirst = "Recipient", ...recipRest] = recipientName.split(" ");
  const recipLast = recipRest.join(" ") || recipFirst;

  const res = await fetch("https://api.thunes.com/v2/money-transfer/transactions", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: crypto.randomUUID(),
      source:      { amount: sourceAmount, currency: "CAD" },
      destination: {
        amount: targetAmount, currency: targetCurrency, country: targetCountry,
        service: "WALLET",
        payer:   { slug: thunesPayer(targetCountry) },
      },
      credit_party_identifier: { msisdn: recipientAccount },
      sender:      { lastname: senderLast, firstname: senderFirst, address: { country: "CA" } },
      beneficiary: { lastname: recipLast,  firstname: recipFirst },
    }),
  });
  const data = await res.json() as { id?: string | number; message?: string };
  if (!res.ok || !data.id) throw new Error(`Thunes: ${data.message ?? res.status}`);
  return String(data.id);
}

// ── SMS ───────────────────────────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────────

interface ExecuteRequest {
  token: string;
  sig: string;
  receiveMode: "card" | "bank";
  recipientCard?: string;      // 16 dígitos sin espacios — solo si receiveMode === "card"
  recipientAccount?: string;   // CLABE/IBAN/etc. — solo si receiveMode === "bank"
  recipientName: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: ExecuteRequest = await req.json();
    const { token, sig, receiveMode, recipientName } = body;
    const recipientCard    = body.recipientCard?.replace(/\s/g, "") ?? "";
    const recipientAccount = body.recipientAccount?.trim() ?? "";

    if (!token || !sig || !recipientName?.trim()) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    if (receiveMode === "card" && recipientCard.length !== 16) {
      return NextResponse.json({ error: "Número de tarjeta inválido", errorCode: "CARD_NOT_FOUND" }, { status: 400 });
    }
    if (receiveMode === "bank" && recipientAccount.length < 5) {
      return NextResponse.json({ error: "Cuenta inválida", errorCode: "INVALID_ACCOUNT" }, { status: 400 });
    }

    const secret = process.env.LINK_SECRET        ?? "dev-secret";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const payload = await parseRemesaLink(token, sig, secret);
    if (!payload) {
      return NextResponse.json({ error: "Link inválido o expirado" }, { status: 401 });
    }

    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
    const session = await stripe.checkout.sessions.retrieve(payload.stripeSessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Pago no completado" }, { status: 401 });
    }

    // Balance checks (soft — solo loguear)
    if (receiveMode === "bank") {
      const wiseBal = await getWiseCADBalance(
        process.env.WISE_PROFILE_ID ?? "",
        process.env.WISE_API_KEY    ?? "",
      );
      if (wiseBal < payload.amount * 1.1) {
        console.warn(`LOW_WISE_BALANCE: ${wiseBal} CAD available, needed ${payload.amount}`);
      }
    }

    let txId: string;
    let railLabel: string;

    try {
      if (receiveMode === "card") {
        // Push a tarjeta no disponible (Paysend/NIUM eliminados) → usar P2P en /p2p
        return NextResponse.json(
          { error: "Card push no disponible. Usa omnipay.com/p2p para envíos LATAM.", errorCode: "RAIL_UNAVAILABLE" },
          { status: 503 },
        );
      } else {
        // ── Rail Wise / Thunes: cuenta bancaria o wallet móvil ────────────────
        const rail = selectRemesaRail(payload.targetCountry);
        if (rail === "p2p_pending") {
          return NextResponse.json({ error: "Esta región no está disponible aún" }, { status: 503 });
        }
        if (rail === "thunes") {
          txId = await executeThunes(
            process.env.THUNES_CLIENT_ID ?? "",
            process.env.THUNES_SECRET    ?? "",
            recipientName.trim(),
            recipientAccount,
            payload.targetCountry,
            payload.targetCurrency,
            payload.amount,
            payload.targetAmount,
            payload.senderName ?? "OmniPay Sender",
          );
          railLabel = "Thunes";
        } else {
          txId = await executeWise(
            process.env.WISE_PROFILE_ID ?? "",
            process.env.WISE_API_KEY    ?? "",
            recipientName.trim(),
            recipientAccount,
            payload.targetCountry,
            payload.targetCurrency,
            payload.amount,
            payload.recipientPhone,
            payload.senderPhone,
          );
          railLabel = "Wise";
        }
      }
    } catch (railErr) {
      const err = railErr as Error & { code?: string };
      const errorCode = err.code ?? "TRANSFER_FAILED";

      // Recuperable — el receptor puede reintentar con datos correctos
      if (errorCode === "INVALID_ACCOUNT" || errorCode === "CARD_NOT_FOUND" || errorCode === "CARD_NOT_ELIGIBLE") {
        return NextResponse.json(
          { error: err.message, errorCode },
          { status: 422 },
        );
      }

      // Balance bajo — transitorio
      if (errorCode === "INSUFFICIENT_FUNDS") {
        return NextResponse.json(
          { error: "Servicio temporalmente no disponible. Intenta en 30 minutos.", errorCode },
          { status: 503 },
        );
      }

      // Límite superado — pedir monto menor o esperar
      if (errorCode === "LIMIT_EXCEEDED") {
        return NextResponse.json(
          { error: "El monto supera el límite de transferencia. Intenta con un monto menor.", errorCode },
          { status: 422 },
        );
      }

      // Irrecuperable → reembolso Stripe automático
      try {
        const refund = await stripe.refunds.create({
          payment_intent: session.payment_intent as string,
        });
        return NextResponse.json(
          { error: "No pudimos procesar la transferencia. Tu pago será reembolsado en 3-5 días.", errorCode: "REFUNDED", refundId: refund.id },
          { status: 422 },
        );
      } catch (refundErr) {
        console.error("Stripe refund failed:", refundErr);
        return NextResponse.json(
          { error: `Error al procesar. Contacta soporte con este ID: ${session.id}`, errorCode: "TRANSFER_FAILED" },
          { status: 500 },
        );
      }
    }

    // Comprobante firmado HMAC
    const receiptUrl = await buildReceiptURL(
      {
        id: txId,
        a:  payload.targetAmount,
        c:  payload.targetCurrency,
        n:  payload.senderName ?? payload.senderPhone,
        ts: Date.now(),
        tt: "remesa",
      },
      appUrl,
      secret,
    );

    // SMS a ambas partes (fire-and-forget)
    await Promise.allSettled([
      sendSMS(payload.senderPhone,
        `OmniPay: Tu remesa de ${payload.amount} ${payload.currency} fue aceptada. En proceso vía ${railLabel}. Comprobante: ${receiptUrl}`),
      sendSMS(payload.recipientPhone,
        `OmniPay: Recibirás ${payload.targetAmount} ${payload.targetCurrency} vía ${railLabel}. Comprobante: ${receiptUrl}`),
    ]);

    // Stripe Instant Payout para reponer el float operativo (async, non-blocking)
    stripe.payouts.create({
      amount:               Math.round(payload.amount * 100),
      currency:             "cad",
      method:               "instant",
      statement_descriptor: "OMNIPAY_REPLEN",
    }).catch((e: Error) => console.warn("Stripe replenishment payout failed:", e.message));

    return NextResponse.json({ status: "processing", receipt_url: receiptUrl, rail: railLabel });
  } catch (err) {
    console.error("Remesa execute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar la remesa" },
      { status: 500 },
    );
  }
}
