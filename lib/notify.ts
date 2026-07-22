// Notificaciones post-pago — stateless, fire-and-forget
// Enviado SOLO desde el webhook del servidor, nunca desde el cliente.

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

// B2B — confirmación de pago pendiente (Stripe cobrado, Wise ejecutará en 3-4 días)
export async function sendB2BPendingNotification(
  senderPhone:   string,
  recipientName: string,
  amount:        number,
  currency:      string,
  piRef:         string,   // últimos 8 chars del PI para referencia
): Promise<void> {
  const body =
    `✅ OmniPay: Tu pago de ${fmt(amount, currency)} a ${recipientName} fue confirmado. ` +
    `El receptor lo recibirá en 3-4 días hábiles. ` +
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

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;
  await fetch(url).catch(() => { /* non-critical */ });
}
