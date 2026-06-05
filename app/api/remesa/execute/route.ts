import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { parseRemesaLink, buildReceiptURL } from "@/lib/link";
import { selectRemesaRail } from "@/constants/remesa-rails";

// POST /api/remesa/execute
// El receptor confirma su cuenta bancaria. Este endpoint:
//   1. Verifica HMAC del link (stateless)
//   2. Verifica que el emisor pagó en Stripe
//   3. Dispersa vía Wise (cuentas bancarias) o Thunes (wallets móviles/China)
//   4. Genera comprobante firmado HMAC

// ── Helpers Wise ──────────────────────────────────────────────────────────────

function wiseAccountType(countryCode: string): string {
  const map: Record<string, string> = {
    MX: "mexican_account", US: "aba",     CA: "canadian",
    GB: "sort_code",       AU: "australian",
    BR: "brazil",          IN: "indian",  JP: "japan",
    KR: "privatBank",      SG: "singaporean",
    NZ: "newzealand",      HK: "hongkong", TH: "thailand",
    VN: "vietnam",         ID: "indonesian",
    AE: "emirates",        SA: "saudi_arabian",
  };
  const sepa = new Set(["DE","FR","ES","IT","NL","PT","BE","AT","SE","NO","DK","FI",
    "IE","PL","RO","HU","CZ","GR","SK","HR","BG","CH","EE","LV","LT","LU","MT","CY",
    "SI","IS","LI"]);
  if (sepa.has(countryCode.toUpperCase())) return "iban";
  return map[countryCode.toUpperCase()] ?? "iban";
}

async function executeWise(
  profileId: string,
  apiKey: string,
  recipientAccountName: string,
  recipientAccount: string,
  targetCountry: string,
  targetCurrency: string,
  sourceAmount: number,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const accountRes = await fetch("https://api.wise.com/v1/accounts", {
    method: "POST", headers,
    body: JSON.stringify({
      profile:           profileId,
      accountHolderName: recipientAccountName,
      currency:          targetCurrency,
      type:              wiseAccountType(targetCountry),
      details: { legalType: "PRIVATE", accountNumber: recipientAccount },
    }),
  });
  const account = await accountRes.json() as { id?: number; error?: string };
  if (!accountRes.ok || !account.id) throw new Error(`Wise account: ${account.error ?? accountRes.status}`);

  const quoteRes = await fetch(`https://api.wise.com/v3/profiles/${profileId}/quotes`, {
    method: "POST", headers,
    body: JSON.stringify({ sourceCurrency: "CAD", targetCurrency, sourceAmount }),
  });
  const quote = await quoteRes.json() as { id?: string; error?: string };
  if (!quoteRes.ok || !quote.id) throw new Error(`Wise quote: ${quote.error ?? quoteRes.status}`);

  const transferRes = await fetch("https://api.wise.com/v1/transfers", {
    method: "POST", headers,
    body: JSON.stringify({
      targetAccount:         account.id,
      quoteUuid:             quote.id,
      customerTransactionId: crypto.randomUUID(),
      details: { reference: "OmniPay remesa" },
    }),
  });
  const transfer = await transferRes.json() as { id?: number; error?: string };
  if (!transferRes.ok || !transfer.id) throw new Error(`Wise transfer: ${transfer.error ?? transferRes.status}`);

  const fundRes = await fetch(
    `https://api.wise.com/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
    { method: "POST", headers, body: JSON.stringify({ type: "BALANCE" }) },
  );
  if (!fundRes.ok) {
    const e = await fundRes.json() as { error?: string };
    throw new Error(`Wise fund: ${e.error ?? fundRes.status}`);
  }
  return String(transfer.id);
}

// ── Helpers Thunes ────────────────────────────────────────────────────────────

function thunesService(countryCode: string): string {
  const walletCountries = new Set(["CN","PH","PK","BD","MM","SN","CI","CM","BF","ML","MW"]);
  return walletCountries.has(countryCode.toUpperCase()) ? "WALLET" : "BANK_ACCOUNT";
}

function thunesPayer(countryCode: string): string {
  const map: Record<string, string> = {
    CN: "wechat_pay",     PH: "gcash",
    PK: "jazzcash",       BD: "bkash",
    MM: "wavemoney",      TZ: "mpesa_tz",
    ZM: "mpesa_zm",       MZ: "mpesa_mz",
    UG: "mtn_ug",         ZW: "ecocash",
    ET: "telebirr",       SN: "orange_money_sn",
    CI: "orange_money_ci", CM: "mtn_cm",
    BF: "orange_money_bf", ML: "orange_money_ml",
    LB: "whish_lb",       MW: "airtel_mw",
  };
  return map[countryCode.toUpperCase()] ?? "bank_account";
}

async function executeThunes(
  clientId: string,
  secret: string,
  recipientAccountName: string,
  recipientAccount: string,
  targetCountry: string,
  targetCurrency: string,
  sourceAmount: number,
  targetAmount: number,
  senderName: string,
): Promise<string> {
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const nameParts = senderName.split(" ");
  const senderLast  = nameParts.slice(1).join(" ") || nameParts[0];
  const senderFirst = nameParts[0];
  const recipParts  = recipientAccountName.split(" ");
  const recipLast   = recipParts.slice(1).join(" ") || recipParts[0];
  const recipFirst  = recipParts[0];

  const res = await fetch("https://api.thunes.com/v2/money-transfer/transactions", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: crypto.randomUUID(),
      source:      { amount: sourceAmount, currency: "CAD" },
      destination: {
        amount: targetAmount, currency: targetCurrency, country: targetCountry,
        service: thunesService(targetCountry),
        payer:   { slug: thunesPayer(targetCountry) },
      },
      credit_party_identifier: { msisdn: recipientAccount },
      sender:      { lastname: senderLast,  firstname: senderFirst, address: { country: "CA" } },
      beneficiary: { lastname: recipLast,   firstname: recipFirst },
    }),
  });
  const data = await res.json() as { id?: string | number; error?: string };
  if (!res.ok || !data.id) throw new Error(`Thunes: ${data.error ?? res.status}`);
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
  recipientCard: string;   // 16 dígitos de la tarjeta de débito del receptor
  recipientName: string;   // nombre del titular
}

export async function POST(req: NextRequest) {
  try {
    const { token, sig, recipientCard, recipientName }: ExecuteRequest = await req.json();

    if (!token || !sig || !recipientCard?.trim() || !recipientName?.trim()) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    const cardDigits = recipientCard.replace(/\D/g, "");
    if (cardDigits.length !== 16) {
      return NextResponse.json({ error: "Tarjeta de débito inválida" }, { status: 400 });
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

    const rail = selectRemesaRail(payload.targetCountry);
    let txId: string;

    if (rail === "thunes") {
      txId = await executeThunes(
        process.env.THUNES_CLIENT_ID ?? "",
        process.env.THUNES_SECRET    ?? "",
        recipientName.trim(),
        cardDigits,
        payload.targetCountry,
        payload.targetCurrency,
        payload.amount,
        payload.targetAmount,
        payload.senderName ?? "OmniPay Sender",
      );
    } else if (rail === "wise") {
      txId = await executeWise(
        process.env.WISE_PROFILE_ID ?? "",
        process.env.WISE_API_KEY    ?? "",
        recipientName.trim(),
        cardDigits,
        payload.targetCountry,
        payload.targetCurrency,
        payload.amount,
      );
    } else {
      return NextResponse.json({ error: "Esta región no está disponible aún" }, { status: 503 });
    }

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

    const railLabel = rail === "thunes" ? "Thunes" : "Wise";
    await Promise.allSettled([
      sendSMS(payload.senderPhone,
        `OmniPay: Tu remesa de ${payload.amount} ${payload.currency} fue aceptada. En proceso vía ${railLabel}. Comprobante: ${receiptUrl}`),
      sendSMS(payload.recipientPhone,
        `OmniPay: Recibirás ${payload.targetAmount} ${payload.targetCurrency}. En proceso vía ${railLabel}. Comprobante: ${receiptUrl}`),
    ]);

    return NextResponse.json({ status: "processing", receipt_url: receiptUrl, rail });
  } catch (err) {
    console.error("Remesa execute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar la remesa" },
      { status: 500 },
    );
  }
}
