import { NextRequest, NextResponse } from "next/server";
import { createVerify }              from "crypto";
import { decryptPayload }            from "@/lib/accountcrypto";
import { getRedis }                  from "@/lib/redis";
import { getWiseAccountType, buildWiseAccountDetails } from "@/lib/wise-accounts";

// POST /api/webhooks/wise
//
// Handles two event types:
//
// 1. transfers#state-change  — B2B outgoing transfer status (existing)
//    outgoing_payment_sent → SMS to recipient + sender
//    funds_refunded        → SMS to sender
//
// 2. balances#credit  — P2P incoming payment from sender (NEW)
//    Money arrived in OmniPay's Wise balance from a sender.
//    Reference = OP-xxxxx → look up Redis → decrypt token →
//    execute Wise payout to recipient's bank (CLABE/PIX/IBAN/etc).

const OMNI_PCT  = 0.005;
const OMNI_MIN  = 1.99;
const OMNI_FLAT = 0.99;

// ── Wise transfer status webhook ───────────────────────────────────────────────

interface WiseTransferEvent {
  event_type: string;
  data: {
    resource:      { id: number; type: string };
    current_state: string;
    previous_state:string;
  };
}

interface WiseBalanceCreditEvent {
  event_type: string;
  data: {
    resource:         { type: string; id: number; profile_id: number; currency: string };
    amount:           number;
    currency:         string;
    transaction_type: string;
    reference?:       string;
    third_party?:     { id: string; name: string };
  };
}

interface WiseTransfer {
  id:             number;
  reference?:     string;
  targetAmount:   number;
  targetCurrency: string;
  sourceAmount:   number;
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
  const recipientMatch = reference.match(/r:(\+?\d+)/);
  const senderMatch    = reference.match(/s:(\+?\d+)/);
  return {
    recipient: recipientMatch?.[1] ?? "",
    sender:    senderMatch?.[1]    ?? "",
  };
}

// ── Wise payout (reused from remesa/execute pattern) ──────────────────────────

async function executeWisePayout(params: {
  profileId:      string;
  apiKey:         string;
  recipientName:  string;
  recipientAccount: string;
  targetCountry:  string;
  targetCurrency: string;
  sourceAmount:   number;
  sourceCurrency: string;
  orderId:        string;
}): Promise<string> {
  const { profileId, apiKey, recipientName, recipientAccount,
          targetCountry, targetCurrency, sourceAmount, sourceCurrency, orderId } = params;
  const headers = {
    Authorization:  `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // 1. Create recipient account
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
    throw new Error(`Wise account: ${account.errors?.[0]?.message ?? accountRes.status}`);
  }

  // 2. Quote — sourceAmount in sender's currency → targetCurrency
  const quoteRes = await fetch(`https://api.wise.com/v3/profiles/${profileId}/quotes`, {
    method: "POST", headers,
    body: JSON.stringify({ sourceCurrency, targetCurrency, sourceAmount }),
  });
  const quote = await quoteRes.json() as { id?: string; errors?: Array<{ message: string }> };
  if (!quoteRes.ok || !quote.id) {
    throw new Error(`Wise quote: ${quote.errors?.[0]?.message ?? quoteRes.status}`);
  }

  // 3. Create transfer
  const transferRes = await fetch("https://api.wise.com/v1/transfers", {
    method: "POST", headers,
    body: JSON.stringify({
      targetAccount:         account.id,
      quoteUuid:             quote.id,
      customerTransactionId: orderId,
      details: { reference: `OmniPay ${orderId}` },
    }),
  });
  const transfer = await transferRes.json() as { id?: number; errors?: Array<{ message: string }> };
  if (!transferRes.ok || !transfer.id) {
    throw new Error(`Wise transfer: ${transfer.errors?.[0]?.message ?? transferRes.status}`);
  }

  // 4. Fund from Wise balance
  const fundRes = await fetch(
    `https://api.wise.com/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
    { method: "POST", headers, body: JSON.stringify({ type: "BALANCE" }) },
  );
  if (!fundRes.ok) {
    const e = await fundRes.json() as { errors?: Array<{ message: string }> };
    throw new Error(`Wise fund: ${e.errors?.[0]?.message ?? fundRes.status}`);
  }
  return String(transfer.id);
}

// ── SMS (fire-and-forget) ─────────────────────────────────────────────────────

async function sendSMS(to: string, body: string) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return;
  const phone = to.startsWith("+") ? to : `+${to.replace(/\D/g, "")}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization:  `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, From: from, Body: body }).toString(),
  }).catch(() => {});
}

async function notifyAdmin(msg: string) {
  const adminWa = (process.env.ADMIN_WHATSAPP ?? "").replace(/\D/g, "");
  if (!adminWa) return;
  // Use CallMeBot if configured, otherwise log
  const apiKey = process.env.CALLMEBOT_API_KEY ?? "";
  if (!apiKey) { console.log("[wise-webhook] admin:", msg); return; }
  await fetch(
    `https://api.callmebot.com/whatsapp.php?phone=${adminWa}&apikey=${apiKey}&text=${encodeURIComponent(msg)}`,
  ).catch(() => {});
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rawBody   = await req.text();
    const signature = req.headers.get("x-wise-signature-sha256") ?? "";
    const publicKey = process.env.WISE_WEBHOOK_PUBLIC_KEY ?? "";

    // Verify RSA-SHA256 signature (skip in test mode)
    if (publicKey && signature && process.env.WISE_SKIP_SIG !== "true") {
      try {
        const verify = createVerify("SHA256");
        verify.update(rawBody);
        if (!verify.verify(publicKey, signature, "base64")) {
          console.warn("Wise webhook: invalid signature");
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
      } catch (sigErr) {
        console.error("Wise webhook sig error:", sigErr);
        return NextResponse.json({ error: "Signature error" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as WiseTransferEvent & WiseBalanceCreditEvent;
    const apiKey    = process.env.WISE_API_KEY    ?? "";
    const profileId = process.env.WISE_PROFILE_ID ?? "";

    // ── balances#credit — P2P incoming payment ────────────────────────────────
    if (event.event_type === "balances#credit") {
      const creditData = event.data;
      const reference  = creditData.reference ?? "";
      const received   = creditData.amount;
      const srcCurrency = creditData.currency;

      // Only process OmniPay P2P orders (reference starts with "OP-")
      if (!reference.startsWith("OP-")) {
        console.log(`[wise-webhook] balances#credit ignored — ref: "${reference}"`);
        return NextResponse.json({ ok: true });
      }

      console.log(`[wise-webhook] P2P credit: ${received} ${srcCurrency} ref=${reference}`);

      // Look up order in Redis
      let encryptedToken: string | null = null;
      try {
        const redis = await getRedis();
        encryptedToken = await redis.get(`p2p:order:${reference}`);
      } catch (e) {
        console.error("[wise-webhook] Redis lookup failed:", e);
        await notifyAdmin(`⚠️ OmniPay: Redis error para ref ${reference}. Pago ${received} ${srcCurrency} llegó pero no se procesó.`);
        return NextResponse.json({ ok: true }); // ack Wise
      }

      if (!encryptedToken) {
        console.warn(`[wise-webhook] Order not found: ${reference}`);
        await notifyAdmin(`⚠️ OmniPay: Pago ${received} ${srcCurrency} llegó con ref ${reference} pero no se encontró la orden. Revisar manualmente.`);
        return NextResponse.json({ ok: true });
      }

      // Decrypt token — bank details exist only in this server memory during execution
      let meta: {
        nombre:          string;
        country:         string;
        target_currency: string;
        amount_target:   number;
        receive_method:  string;
        clabe?:          string | null;
        iban?:           string | null;
        bic?:            string | null;
        pix_key?:        string | null;
        routing_number?: string | null;
        account_number?: string | null;
        sort_code?:      string | null;
        recipient_phone?:string | null;
      };
      try {
        const decrypted = await decryptPayload(encryptedToken);
        meta = JSON.parse(decrypted.account);
      } catch (e) {
        console.error("[wise-webhook] Token decrypt failed:", e);
        await notifyAdmin(`⚠️ OmniPay: Token inválido para ${reference}. Pago ${received} ${srcCurrency} requiere acción manual.`);
        return NextResponse.json({ ok: true });
      }

      // Determine recipient account string from bank details in token
      const recipientAccount =
        meta.clabe          ??
        meta.pix_key        ??
        meta.iban           ??
        meta.account_number ??
        "";

      if (!recipientAccount) {
        console.error("[wise-webhook] No recipient account in token for", reference);
        await notifyAdmin(`⚠️ OmniPay: Sin cuenta destino para ${reference}. Manual requerido.`);
        return NextResponse.json({ ok: true });
      }

      // Deduct OmniPay fee — forward the rest to recipient
      const omnipayFee   = parseFloat((Math.max(received * OMNI_PCT, OMNI_MIN) + OMNI_FLAT).toFixed(2));
      const forwardAmount = parseFloat((received - omnipayFee).toFixed(2));

      console.log(`[wise-webhook] Forwarding ${forwardAmount} ${srcCurrency} → ${meta.target_currency} to ${meta.nombre}`);

      try {
        const transferId = await executeWisePayout({
          profileId,
          apiKey,
          recipientName:    meta.nombre,
          recipientAccount,
          targetCountry:    meta.country,
          targetCurrency:   meta.target_currency,
          sourceAmount:     forwardAmount,
          sourceCurrency:   srcCurrency,
          orderId:          reference,
        });

        // Delete order from Redis — bank details no longer needed
        try {
          const redis = await getRedis();
          await redis.del(`p2p:order:${reference}`);
        } catch { /* non-critical */ }

        // Notify admin
        await notifyAdmin(
          `✅ OmniPay P2P\nRef: ${reference}\nRecibido: ${received} ${srcCurrency}\nEnviado a: ${meta.nombre} (${meta.country})\nTransfer Wise ID: ${transferId}`,
        );

        // SMS to recipient if phone available
        if (meta.recipient_phone) {
          await sendSMS(meta.recipient_phone,
            `✅ OmniPay: Tu dinero llegó. ${meta.amount_target} ${meta.target_currency} depositado en tu cuenta.`);
        }

        console.log(`[wise-webhook] P2P complete: ${reference} → Wise transfer ${transferId}`);
      } catch (payoutErr) {
        const e = payoutErr as Error;
        console.error("[wise-webhook] Payout failed:", e.message);
        await notifyAdmin(
          `🚨 OmniPay P2P ERROR\nRef: ${reference}\nRecibido: ${received} ${srcCurrency}\nError: ${e.message}\nAcción manual requerida.`,
        );
      }

      return NextResponse.json({ ok: true });
    }

    // ── transfers#state-change — B2B outgoing transfer ────────────────────────
    if (event.event_type !== "transfers#state-change") {
      return NextResponse.json({ ok: true }); // ignore other events
    }

    const { current_state, resource } = event.data;
    const transfer = await getWiseTransfer(resource.id, apiKey);
    const reference = transfer?.reference ?? "";
    const { recipient, sender } = parsePhonesFromReference(reference);

    if (current_state === "outgoing_payment_sent") {
      const amount   = transfer?.targetAmount ?? 0;
      const currency = transfer?.targetCurrency ?? "";
      await Promise.allSettled([
        sendSMS(recipient, `✅ OmniPay: Tu dinero llegó. ${amount} ${currency} depositado en tu cuenta.`),
        sendSMS(sender,    `✅ OmniPay: Tu remesa fue entregada exitosamente vía Wise.`),
      ]);
    } else if (current_state === "funds_refunded") {
      await sendSMS(sender, `⚠️ OmniPay: Tu remesa vía Wise no pudo completarse. El monto fue devuelto.`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Wise webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
