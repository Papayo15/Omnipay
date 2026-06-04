// SMS automático post-pago — stateless, fire-and-forget
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
