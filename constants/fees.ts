export const COMMISSION_RATE = 0.0025; // 0.25%

// Cuenta corporativa OmniPay — destino de comisiones
export const OMNIPAY_CORPORATE_ACCOUNT = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";

export function calcFees(amount: number, mode: "A" | "B") {
  const fee = parseFloat((amount * COMMISSION_RATE).toFixed(2));
  if (mode === "A") {
    // Emisor absorbe el fee: paga amount + fee, receptor recibe amount
    return { senderPays: amount + fee, receiverGets: amount, fee };
  }
  // Receptor absorbe el fee: emisor paga amount, receptor recibe amount - fee
  return { senderPays: amount, receiverGets: amount - fee, fee };
}
