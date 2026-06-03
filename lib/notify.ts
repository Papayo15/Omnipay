// SMS automático post-dispersión — stateless, fire-and-forget
// Enviado SOLO desde el webhook del servidor, nunca desde el cliente

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export async function sendPaymentNotification(
  phone: string,     // E.164 format: "+525512345678"
  auditUrl: string,  // /resultado?r=...  (comprobante cifrado con LINK_SECRET)
  amount: number,
  currency: string
): Promise<void> {
  const sid        = process.env.TWILIO_ACCOUNT_SID;
  const token      = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !fromNumber || !phone) return;

  const amountStr = fmt(amount, currency);
  const body = `OmniPay: Recibiste ${amountStr}. Comprobante: ${auditUrl}`;

  const params = new URLSearchParams({ From: fromNumber, To: phone, Body: body });

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  }).catch(() => { /* non-critical — no bloquea la dispersión */ });
}
