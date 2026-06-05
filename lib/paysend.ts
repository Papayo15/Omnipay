// Paysend Enterprise API — push-to-card via Visa Direct / Mastercard Send / UnionPay
// Cobertura: 170 países, Visa + Mastercard + UnionPay (China).
// Credenciales: PAYSEND_API_KEY (del portal developer.paysend.com → Enterprise)
//
// TODO when credentials arrive: verify exact endpoint URL and request body schema
// from the Paysend Enterprise API docs at https://developer.paysend.com

const PAYSEND_BASE = "https://api.paysend.com";

export type PaysendError =
  | "CARD_NOT_ELIGIBLE"   // El banco emisor no soporta OCT push (~2% de casos)
  | "CARD_NOT_FOUND"      // Número de tarjeta inválido (Luhn pasa pero BIN no reconocido)
  | "LIMIT_EXCEEDED"      // Monto supera límite de Visa Direct (~$5,000 CAD/tx)
  | "INSUFFICIENT_FUNDS"  // Float Paysend bajo — tratar igual que Wise
  | "TRANSFER_FAILED";    // Error genérico irrecuperable

interface PaysendTransferResult {
  id: string;
  status: string;
}

interface PaysendErrorBody {
  errorCode?: string;
  error?: string;
  message?: string;
}

export async function executePaysend(
  apiKey:          string,
  recipientName:   string,
  cardNumber:      string,   // 16 dígitos sin espacios
  targetCountry:   string,
  targetCurrency:  string,
  sourceAmountCAD: number,
  senderName:      string,
): Promise<string> {
  const cleanCard = cardNumber.replace(/\s/g, "");

  const res = await fetch(`${PAYSEND_BASE}/api/v2/payouts`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sendCurrency:   "CAD",
      sendAmount:     sourceAmountCAD,
      receiveCurrency: targetCurrency,
      receiveCountry:  targetCountry.toUpperCase(),
      cardNumber:      cleanCard,
      recipientName:   recipientName.trim(),
      senderName:      senderName.trim(),
      externalId:      crypto.randomUUID(),
    }),
  });

  const data = await res.json() as PaysendTransferResult & PaysendErrorBody;

  if (!res.ok || !data.id) {
    const code = (data.errorCode ?? "").toUpperCase();
    if (code.includes("CARD") && code.includes("ELIGIBLE")) {
      throw Object.assign(new Error(data.message ?? "Card not eligible"), { code: "CARD_NOT_ELIGIBLE" as PaysendError });
    }
    if (code.includes("CARD") || code.includes("INVALID")) {
      throw Object.assign(new Error(data.message ?? "Card not found"), { code: "CARD_NOT_FOUND" as PaysendError });
    }
    if (code.includes("LIMIT")) {
      throw Object.assign(new Error(data.message ?? "Limit exceeded"), { code: "LIMIT_EXCEEDED" as PaysendError });
    }
    if (code.includes("FUNDS") || code.includes("BALANCE")) {
      throw Object.assign(new Error(data.message ?? "Insufficient funds"), { code: "INSUFFICIENT_FUNDS" as PaysendError });
    }
    throw Object.assign(
      new Error(`Paysend: ${data.message ?? data.error ?? res.status}`),
      { code: "TRANSFER_FAILED" as PaysendError },
    );
  }

  return data.id;
}

export async function getPaysendBalance(apiKey: string): Promise<number> {
  try {
    const res = await fetch(`${PAYSEND_BASE}/api/v2/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json() as { available?: number; currency?: string } | { balances?: Array<{ currency: string; available: number }> };
    // Handle both single-balance and multi-balance response shapes
    if ("balances" in data && Array.isArray(data.balances)) {
      return data.balances.find((b) => b.currency === "CAD")?.available ?? 0;
    }
    if ("available" in data) return data.available ?? 0;
    return 0;
  } catch { return 0; }
}
