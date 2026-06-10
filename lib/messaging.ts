// Utilidades de mensajería client-side — deeplinks nativos sin dependencias
// WhatsApp y Telegram abren la app instalada en el dispositivo del usuario.
// No requieren aprobación de API, cuentas de negocio ni costos por mensaje.

export function cleanPhone(phone: string): string {
  // Elimina todo excepto dígitos; preserva el prefijo internacional implícito
  return phone.replace(/\D/g, "");
}

export function buildWhatsAppLink(message: string, phone?: string): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    const digits = cleanPhone(phone);
    return `https://wa.me/${digits}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function buildTelegramLink(trackingUrl: string, message: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(trackingUrl)}&text=${encodeURIComponent(message)}`;
}

export interface OmniPayMessageParams {
  clientName:    string;
  transactionId: string;
  amount:        number;
  currency:      string;
  concept:       string;
  date:          string;
  trackingUrl:   string;
}

export function buildOmniPayMessage(p: OmniPayMessageParams): string {
  const amountFmt = new Intl.NumberFormat("es-MX", {
    style:    "currency",
    currency: p.currency,
  }).format(p.amount);

  return (
    `💳 *OmniPay - Notificación de Pago*\n\n` +
    `Hola, ${p.clientName}. Tu transacción ha sido procesada con éxito.\n\n` +
    `🔹 *ID:* ${p.transactionId}\n` +
    `🔹 *Monto:* ${amountFmt}\n` +
    `🔹 *Concepto:* ${p.concept}\n` +
    `🔹 *Fecha:* ${p.date}\n\n` +
    `Puedes revisar los detalles aquí: ${p.trackingUrl}\n\n` +
    `_Gracias por usar OmniPay._`
  );
}
