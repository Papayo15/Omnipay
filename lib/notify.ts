// Notificaciones post-pago — stateless, fire-and-forget
// Enviado SOLO desde el webhook del servidor, nunca desde el cliente.
// Email via Resend (3,000/mes gratis). SMS via Twilio (legacy, solo si vars configuradas).

// ── Email (Resend) ────────────────────────────────────────────────────────────
// Requiere: RESEND_API_KEY en variables de entorno
// From: onboarding@resend.dev (no requiere dominio verificado)
// En producción: cambiar a "OmniPay <no-reply@omnipay.ca>" tras verificar SPF/DKIM en resend.com
export async function sendEmailNotification(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "OmniPay <no-reply@omnipay.solutions>", to, subject, html }),
  }).catch(() => {});
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

async function sendSMS(phone: string, body: string): Promise<void> {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const tok  = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !tok || !from || !phone) return;
  const p = phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${tok}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: p, Body: body }).toString(),
  }).catch(() => {});
}

// B2B — confirmación de pago pendiente (Stripe cobrado, Wise ejecutará en 4-5 días hábiles)
export async function sendB2BPendingNotification(
  senderPhone:   string,
  recipientName: string,
  amount:        number,
  currency:      string,
  piRef:         string,   // últimos 8 chars del PI para referencia
): Promise<void> {
  const body =
    `✅ OmniPay: Tu pago de ${fmt(amount, currency)} a ${recipientName} fue confirmado. ` +
    `El receptor lo recibirá en 4-5 días hábiles. ` +
    `Referencia: ${piRef}`;
  await sendSMS(senderPhone, body);
}

export async function sendPaymentNotification(
  phone: string,       // E.164: "+525512345678"
  receiptUrl: string,  // /resultado?r=... (comprobante sin PII)
  amount: number,
  currency: string,
  merchantName?: string
): Promise<void> {
  const sid        = process.env.TWILIO_ACCOUNT_SID;
  const token      = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !fromNumber || !phone) return;

  const amountStr = fmt(amount, currency);
  const body = merchantName
    ? `OmniPay: Pago de ${amountStr} en ${merchantName}. Comprobante: ${receiptUrl}`
    : `OmniPay: Recibiste ${amountStr}. Comprobante: ${receiptUrl}`;

  const params = new URLSearchParams({ From: fromNumber, To: phone, Body: body });

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  }).catch(() => { /* non-critical */ });
}

// WhatsApp admin alert via CallMeBot (gratuito, personal)
// Configura en Vercel: CALLMEBOT_API_KEY + ADMIN_WHATSAPP_PHONE (E.164, ej. +529993825321)
export async function sendAdminWhatsApp(message: string): Promise<void> {
  const phone  = process.env.ADMIN_WHATSAPP_PHONE;
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!phone || !apiKey) return;

  // CallMeBot requires phone without + (e.g. 5215512345678, not +5215512345678)
  const phoneClean = phone.replace(/^\+/, "");
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phoneClean}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;
  try {
    const res = await fetch(url);
    const body = await res.text();
    console.log(`[callmebot] status=${res.status} phone=${phoneClean} body=${body.slice(0, 200)}`);
  } catch (e) {
    console.error("[callmebot] fetch error:", e);
  }
}
