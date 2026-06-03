import { NextRequest, NextResponse } from "next/server";
import { sendPaymentNotification } from "@/lib/notify";

export const runtime = "edge";

// Webhook handler — Stripe only (Wise permanently retired)
// On checkout.session.completed:
//   1. Fire outbound transfer (visa_direct | stripe_connect | airwallex | stablecoin)
//   2. Send Twilio SMS/WhatsApp to recipient

async function verifyHMAC(payload: string, secret: string, signature: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig      = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const incoming = signature.replace(/^sha256=/, "").toLowerCase();
    if (computed.length !== incoming.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ incoming.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

interface StripeResult {
  ok: boolean; completed: boolean;
  amount: number; currency: string;
  recipientPhone: string; auditUrl: string; sessionId: string;
  bankToken: string; bankName: string; country: string;
  receiverName: string; targetCurrency: string; sourceCurrency: string;
  outboundRail: string; paymentIntentId: string;
}

const EMPTY_RESULT: StripeResult = {
  ok: false, completed: false, amount: 0, currency: "", recipientPhone: "",
  auditUrl: "", sessionId: "", bankToken: "", bankName: "", country: "",
  receiverName: "", targetCurrency: "", sourceCurrency: "", outboundRail: "", paymentIntentId: "",
};

async function verifyStripe(rawBody: string, sigHeader: string): Promise<StripeResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const parts  = sigHeader.split(",");
  const t      = parts.find((p) => p.startsWith("t="))?.slice(2)  ?? "";
  const v1     = parts.find((p) => p.startsWith("v1="))?.slice(3) ?? "";
  const ok     = secret ? await verifyHMAC(`${t}.${rawBody}`, secret, v1) : false;

  if (!ok) return EMPTY_RESULT;

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return { ...EMPTY_RESULT, ok }; }

  const type      = String(event.type ?? "");
  const completed = type === "checkout.session.completed";
  if (!completed) return { ...EMPTY_RESULT, ok, completed: false };

  const session = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  const meta    = session?.metadata as Record<string, unknown> | undefined;

  return {
    ok, completed: true,
    amount:          Number(session?.amount_total ?? 0) / 100,
    currency:        String(session?.currency ?? "mxn").toUpperCase(),
    recipientPhone:  String(meta?.recipient_phone  ?? ""),
    auditUrl:        String(meta?.audit_url        ?? ""),
    sessionId:       String(session?.id            ?? ""),
    bankToken:       String(meta?.bank_token       ?? ""),
    bankName:        String(meta?.bank_name        ?? ""),
    country:         String(meta?.country          ?? ""),
    receiverName:    String(meta?.receiver_name    ?? ""),
    targetCurrency:  String(meta?.target_currency  ?? session?.currency ?? ""),
    sourceCurrency:  String(meta?.source_currency  ?? ""),
    outboundRail:    String(meta?.outbound_rail    ?? ""),
    paymentIntentId: String(session?.payment_intent ?? ""),
  };
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const stripeHdr = req.headers.get("stripe-signature") ?? "";

  if (!stripeHdr) {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }

  const result = await verifyStripe(rawBody, stripeHdr);
  if (!result.ok) return NextResponse.json({ error: "invalid stripe signature" }, { status: 401 });

  if (result.completed) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    // ── Conciliation bridge — fire-and-forget outbound transfer ──
    if (result.outboundRail && result.bankToken) {
      const bridgeBody = JSON.stringify({
        amount:          result.amount,
        currency:        result.currency.toLowerCase(),
        targetCurrency:  result.targetCurrency || result.currency.toLowerCase(),
        sourceCurrency:  result.sourceCurrency || result.currency.toLowerCase(),
        bankToken:       result.bankToken,
        bankName:        result.bankName,
        country:         result.country,
        receiverName:    result.receiverName,
        receiverToken:   result.bankToken,
        feeAmount:       parseFloat((result.amount * 0.0025).toFixed(2)),
        paymentIntentId: result.paymentIntentId,
      });
      const h = { "Content-Type": "application/json" };

      switch (result.outboundRail) {
        case "visa_direct":
          fetch(`${appUrl}/api/payment/stripe/visa-direct`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "stripe_connect":
          fetch(`${appUrl}/api/payment/stripe/connect`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "airwallex":
          fetch(`${appUrl}/api/payment/airwallex`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "flutterwave":
          fetch(`${appUrl}/api/payment/flutterwave`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "stablecoin":
          fetch(`${appUrl}/api/payment/stablecoin`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
      }
    }

    // ── Always: Twilio SMS/WhatsApp ──
    if (result.recipientPhone && result.auditUrl) {
      sendPaymentNotification(result.recipientPhone, result.auditUrl, result.amount, result.currency)
        .catch(() => {});
    }
  }

  return NextResponse.json({ received: true });
}
