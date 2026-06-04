import { NextRequest, NextResponse } from "next/server";
import { parseRemesaLink, buildReceiptURL } from "@/lib/link";
import { decrypt } from "@/lib/crypto";
import { sendPaymentNotification } from "@/lib/notify";
import { selectRemesaRail } from "@/constants/remesa-rails";

export const runtime = "edge";

// POST /api/remesa/execute
// Ejecuta la transferencia tarjeta-a-tarjeta cuando el receptor acepta.
// 1. Verifica y decodifica el RemesaPayload firmado
// 2. Descifra el token AES-256 del emisor → obtiene token Airwallex
// 3. Llama a Airwallex: pull de tarjeta emisor + push OCT a tarjeta receptor
// 4. Genera comprobante firmado y envía SMS a ambos

async function getAirwallexToken(): Promise<string> {
  const res = await fetch("https://api.airwallex.com/api/v1/authentication/login", {
    method: "POST",
    headers: {
      "x-client-id": process.env.AIRWALLEX_CLIENT_ID ?? "",
      "x-api-key":   process.env.AIRWALLEX_API_KEY   ?? "",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error("Airwallex auth failed");
  const { token } = await res.json() as { token: string };
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const { token, sig, recipientCard } = await req.json() as {
      token?: string;
      sig?: string;
      recipientCard?: string;
    };

    const secret = process.env.LINK_SECRET ?? "dev-secret";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    if (!token || !sig || !recipientCard) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const digits = recipientCard.replace(/\D/g, "");
    if (digits.length !== 16) {
      return NextResponse.json({ error: "Tarjeta del receptor inválida" }, { status: 400 });
    }

    // 1. Verificar y decodificar el payload firmado
    const payload = await parseRemesaLink(token, sig, secret);
    if (!payload) {
      return NextResponse.json({ error: "Link inválido o expirado" }, { status: 401 });
    }

    // 2. Descifrar token AES-256 del emisor (senderCardToken es string base64url)
    const senderTokenBuf = await decrypt(payload.senderCardToken, secret);
    const senderToken = new TextDecoder().decode(senderTokenBuf);

    const rail = selectRemesaRail(payload.targetCountry);

    let txId: string;

    if (rail === "thunes") {
      // ── Thunes: pull+push para Asia/África ───────────────────────
      const auth = btoa(`${process.env.THUNES_CLIENT_ID}:${process.env.THUNES_SECRET}`);
      const res = await fetch("https://api.thunes.com/v2/money-transfer/transactions", {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          external_id:         `omnipay-${Date.now()}`,
          source_currency:     payload.currency,
          destination_currency: payload.targetCurrency,
          source_amount:       payload.amount,
          payer: {
            payment_method:   "DEBIT_CARD",
            card_token:       senderToken,
          },
          beneficiary: {
            country:          payload.targetCountry,
            first_name:       (payload.recipientName ?? "").split(" ")[0] || "Receptor",
            last_name:        (payload.recipientName ?? "").split(" ").slice(1).join(" ") || "OmniPay",
            msisdn:           payload.recipientPhone,
            card_number:      digits,
          },
          service: { id: 1 },
        }),
      });
      if (!res.ok) throw new Error(`Thunes: ${await res.text()}`);
      const result = await res.json() as { id: number };
      txId = String(result.id);

    } else {
      // ── Airwallex: pull+push (default para LATAM/EU/USA/Asia) ────
      const awToken = await getAirwallexToken();
      const headers = { Authorization: `Bearer ${awToken}`, "Content-Type": "application/json" };
      const requestId = crypto.randomUUID();

      const res = await fetch("https://api.airwallex.com/api/v1/pa/payment_intents/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          request_id:     requestId,
          amount:         payload.amount,
          currency:       payload.currency,
          merchant_order_id: `omnipay-${Date.now()}`,
          descriptor:     "OmniPay Remesa",
          // Cobro al emisor (payment_consent del token)
          payment_method_options: {
            card: {
              payment_consent_id: senderToken,
              auto_capture:       true,
            },
          },
          // Push al receptor (Visa Direct OCT)
          payout: {
            amount:       payload.targetAmount,
            currency:     payload.targetCurrency,
            destination: {
              type:         "card",
              card_number:  digits,
              country_code: payload.targetCountry,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`Airwallex: ${await res.text()}`);
      const result = await res.json() as { id: string; status: string };
      txId = result.id;
    }

    // 3. Generar comprobante firmado y enviar SMS a ambos
    const receiptUrl = await buildReceiptURL(
      {
        id:  txId,
        a:   payload.targetAmount,
        c:   payload.targetCurrency,
        n:   payload.senderName ?? payload.senderPhone,
        ts:  Date.now(),
        tt:  "remesa",
      },
      appUrl,
      secret
    );

    const senderMsg = `OmniPay: Tu remesa de ${payload.amount} ${payload.currency} fue aceptada. Comprobante: ${receiptUrl}`;
    const recipMsg  = `OmniPay: Recibiste ${payload.targetAmount} ${payload.targetCurrency}. Comprobante: ${receiptUrl}`;

    await Promise.allSettled([
      payload.senderPhone    ? sendSMS(payload.senderPhone,    senderMsg) : Promise.resolve(),
      payload.recipientPhone ? sendSMS(payload.recipientPhone, recipMsg)  : Promise.resolve(),
    ]);

    return NextResponse.json({ tx_id: txId, status: "completed", receipt_url: receiptUrl });
  } catch (err) {
    console.error("Remesa execute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar transferencia" },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────

async function sendSMS(phone: string, body: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID  ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN   ?? "";
  const from  = process.env.TWILIO_PHONE_NUMBER ?? "";
  if (!sid || !token || !from) return;
  const params = new URLSearchParams({ From: from, To: phone, Body: body });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  }).catch(() => {});
}
