import { NextRequest, NextResponse } from "next/server";
import { sendPaymentNotification } from "@/lib/notify";

export const runtime = "edge";

// Webhook Stripe — checkout.session.completed → dispersión inmediata
// Flujo: Stripe captura pago → webhook → Visa Direct / Wise / Airwallex / Binance Pay → SMS

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
  ok: boolean;
  completed: boolean;
  amount: number;
  netAmount: number;
  currency: string;
  recipientPhone: string;
  auditUrl: string;
  sessionId: string;
  bankToken: string;
  bankName: string;
  country: string;
  receiverName: string;
  targetCurrency: string;
  sourceCurrency: string;
  outboundRail: string;
  paymentIntentId: string;
}

const EMPTY_RESULT: StripeResult = {
  ok: false, completed: false, amount: 0, netAmount: 0, currency: "",
  recipientPhone: "", auditUrl: "", sessionId: "", bankToken: "", bankName: "",
  country: "", receiverName: "", targetCurrency: "", sourceCurrency: "",
  outboundRail: "", paymentIntentId: "",
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
  const grossAmount = Number(session?.amount_total ?? 0) / 100;
  const netAmount   = meta?.net_amount ? Number(meta.net_amount) : parseFloat((grossAmount * (1 - 0.0025)).toFixed(2));

  return {
    ok, completed: true,
    amount:          grossAmount,
    netAmount,
    currency:        String(session?.currency ?? "cad").toUpperCase(),
    recipientPhone:  String(meta?.recipient_phone  ?? ""),
    auditUrl:        String(meta?.audit_url        ?? ""),
    sessionId:       String(session?.id            ?? ""),
    bankToken:       String(meta?.bank_token       ?? ""),
    bankName:        String(meta?.bank_name        ?? ""),
    country:         String(meta?.country          ?? ""),
    receiverName:    String(meta?.receiver_name    ?? ""),
    targetCurrency:  String(meta?.target_currency  ?? session?.currency ?? ""),
    sourceCurrency:  String(meta?.source_currency  ?? ""),
    outboundRail:    String(meta?.outbound_rail    ?? "visa_direct"),
    paymentIntentId: String(session?.payment_intent ?? ""),
  };
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const stripeHdr = req.headers.get("stripe-signature") ?? "";

  if (!stripeHdr) {
    return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  }

  const result = await verifyStripe(rawBody, stripeHdr);
  if (!result.ok) return NextResponse.json({ error: "invalid stripe signature" }, { status: 401 });

  if (result.completed) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    // ── Dispersión inmediata — fire-and-forget según outbound_rail ──
    if (result.bankToken) {
      const bridgeBody = JSON.stringify({
        amount:          result.netAmount,
        currency:        result.currency.toLowerCase(),
        targetCurrency:  result.targetCurrency || result.currency.toLowerCase(),
        sourceCurrency:  result.sourceCurrency || result.currency.toLowerCase(),
        bankToken:       result.bankToken,
        bankName:        result.bankName,
        country:         result.country,
        receiverName:    result.receiverName,
        feeAmount:       parseFloat((result.amount * 0.0025).toFixed(2)),
        paymentIntentId: result.paymentIntentId,
      });
      const h = { "Content-Type": "application/json" };

      switch (result.outboundRail) {
        case "visa_direct":
          fetch(`${appUrl}/api/payment/stripe/visa-direct`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "wise":
          fetch(`${appUrl}/api/payment/wise`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "airwallex":
          fetch(`${appUrl}/api/payment/airwallex`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        case "binance_pay":
          fetch(`${appUrl}/api/payment/binance_pay`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
          break;
        default:
          // Sin riel definido — defecto a Visa Direct
          fetch(`${appUrl}/api/payment/stripe/visa-direct`, { method: "POST", headers: h, body: bridgeBody }).catch(console.error);
      }
    }

    // ── SMS Twilio — comprobante cifrado al receptor ──
    if (result.recipientPhone && result.auditUrl) {
      sendPaymentNotification(result.recipientPhone, result.auditUrl, result.netAmount, result.currency)
        .catch(() => {});
    }
  }

  // Siempre 200 para evitar reintentos de Stripe
  return NextResponse.json({ received: true });
}
