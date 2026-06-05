import { NextRequest, NextResponse } from "next/server";
import { createVerify } from "crypto";

// POST /api/webhooks/wise
// Wise firma cada webhook con RSA-SHA256. La clave pública se obtiene de:
//   GET https://api.wise.com/v1/subscriptions/webhooks/public-key
// y se guarda en env var WISE_WEBHOOK_PUBLIC_KEY (PEM string).
//
// Evento principal: transfers#state-change
//   outgoing_payment_sent → Transfer completada → SMS a receptor + emisor
//   funds_refunded        → Transfer devuelta → SMS a emisor

interface WiseWebhookBody {
  event_type: string;
  data: {
    resource: {
      id: number;
      type: string;
    };
    current_state: string;
    previous_state: string;
  };
}

interface WiseTransfer {
  id: number;
  reference?: string;
  targetAmount: number;
  targetCurrency: string;
  sourceAmount: number;
  sourceCurrency: string;
}

async function getWiseTransfer(transferId: number, apiKey: string): Promise<WiseTransfer | null> {
  try {
    const res = await fetch(`https://api.wise.com/v1/transfers/${transferId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json() as WiseTransfer;
  } catch { return null; }
}

function parsePhonesFromReference(reference: string): { recipient: string; sender: string } {
  // Reference format: "OP|r:+1234567890|s:+0987654321"
  const recipientMatch = reference.match(/r:(\+?\d+)/);
  const senderMatch    = reference.match(/s:(\+?\d+)/);
  return {
    recipient: recipientMatch?.[1] ?? "",
    sender:    senderMatch?.[1]    ?? "",
  };
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
    const rawBody = await req.text();
    const signature = req.headers.get("x-wise-signature-sha256") ?? "";
    const publicKey = process.env.WISE_WEBHOOK_PUBLIC_KEY ?? "";

    // Verify Wise RSA-SHA256 signature
    if (publicKey && signature) {
      try {
        const verify = createVerify("SHA256");
        verify.update(rawBody);
        const isValid = verify.verify(publicKey, signature, "base64");
        if (!isValid) {
          console.warn("Wise webhook: invalid signature");
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
      } catch (sigErr) {
        console.error("Wise webhook signature verification error:", sigErr);
        return NextResponse.json({ error: "Signature error" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as WiseWebhookBody;

    if (event.event_type !== "transfers#state-change") {
      return NextResponse.json({ ok: true }); // ignore other events
    }

    const { current_state, resource } = event.data;
    const transferId = resource.id;
    const apiKey = process.env.WISE_API_KEY ?? "";

    const transfer = await getWiseTransfer(transferId, apiKey);
    const reference = transfer?.reference ?? "";
    const { recipient, sender } = parsePhonesFromReference(reference);

    if (current_state === "outgoing_payment_sent") {
      const amount   = transfer?.targetAmount ?? 0;
      const currency = transfer?.targetCurrency ?? "";
      await Promise.allSettled([
        sendSMS(recipient,
          `✅ OmniPay: Tu dinero llegó. ${amount} ${currency} depositado en tu cuenta.`),
        sendSMS(sender,
          `✅ OmniPay: Tu remesa fue entregada exitosamente vía Wise.`),
      ]);
    } else if (current_state === "funds_refunded") {
      await sendSMS(sender,
        `⚠️ OmniPay: Tu remesa vía Wise no pudo completarse. El monto fue devuelto a tu tarjeta Stripe.`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Wise webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
