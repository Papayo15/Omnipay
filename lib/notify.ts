// Notificaciones post-pago — stateless, fire-and-forget
// Enviado SOLO desde el webhook del servidor, nunca desde el cliente.

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
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
// Setup: salva +15551234567 como "CallMeBot" en WA → envía "I allow callmebot to send me messages"
// → recibes tu apiKey en segundos. Luego configura ADMIN_WHATSAPP_PHONE + CALLMEBOT_API_KEY en Vercel.
export async function sendAdminWhatsApp(message: string): Promise<void> {
  const phone  = process.env.ADMIN_WHATSAPP_PHONE;
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!phone || !apiKey) return;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;
  await fetch(url).catch(() => { /* non-critical */ });
}
