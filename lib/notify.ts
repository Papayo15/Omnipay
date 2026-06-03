// Stateless Twilio SMS + WhatsApp notifications
// No data is stored — this function fires and forgets.

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export async function sendPaymentNotification(
  phone: string,     // E.164 format: "+525512345678"
  auditUrl: string,  // /resultado?r=...  (client-decoded, no server query)
  amount: number,
  currency: string
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !fromNumber || !phone) return;

  const amountStr = fmt(amount, currency);
  const body = `✅ OmniPay: Recibiste ${amountStr}. Ver comprobante: ${auditUrl}`;

  const sendMessage = async (from: string, to: string) => {
    const params = new URLSearchParams({ From: from, To: to, Body: body });
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  };

  // SMS (always available with a standard Twilio number)
  await sendMessage(fromNumber, phone).catch(() => {/* non-critical */});

  // WhatsApp (sandbox or production depending on env)
  const sandboxMode = process.env.TWILIO_WHATSAPP_SANDBOX === "true";
  const whatsappFrom = sandboxMode
    ? "whatsapp:+14155238886"
    : process.env.TWILIO_WHATSAPP_NUMBER
      ? `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`
      : null;

  if (whatsappFrom) {
    await sendMessage(whatsappFrom, `whatsapp:${phone}`).catch(() => {/* non-critical */});
  }
}
