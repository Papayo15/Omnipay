// Nium Payouts API — push a tarjeta Visa/MC Y wallets móviles en un solo proveedor.
// Cobertura: ~190 países (banco + tarjeta + wallet).
//
// Credenciales requeridas en Vercel:
//   NIUM_API_KEY          — API key del portal Nium (platform.nium.com)
//   NIUM_CLIENT_HASH_ID   — ID del cliente OmniPay asignado por Nium al aprobar la cuenta
//
// TODO: verificar endpoints y body exacto contra los docs de Nium en:
//       https://docs.nium.com/apis/reference/payouts
//       Nium requiere aprobar la cuenta business antes de activar payouts.

const NIUM_BASE = "https://gateway.nium.com";

// ── Tipos de error que el webhook maneja ──────────────────────────────────────

export type NiumError =
  | "CARD_NOT_ELIGIBLE"   // Banco emisor no soporta OCT push
  | "CARD_NOT_FOUND"      // BIN no reconocido por la red Visa/MC
  | "WALLET_NOT_FOUND"    // Wallet ID / teléfono no registrado en el operador
  | "LIMIT_EXCEEDED"      // Monto supera límite de Visa Direct
  | "INSUFFICIENT_FUNDS"  // Float Nium bajo — error transitorio
  | "TRANSFER_FAILED";    // Error genérico irrecuperable

interface NiumResponse {
  uniqueTransactionNumber?: string;
  transactionId?:           string;
  status?:                  string;
  errorCode?:               string;
  message?:                 string;
  errors?:                  Array<{ code: string; message: string }>;
}

function mapNiumError(errorCode: string): NiumError {
  const code = errorCode.toUpperCase();
  if (code.includes("CARD_NOT_ELIGIBLE") || code.includes("NOT_ELIGIBLE"))  return "CARD_NOT_ELIGIBLE";
  if (code.includes("CARD") || code.includes("INVALID_CARD"))               return "CARD_NOT_FOUND";
  if (code.includes("WALLET") || code.includes("MSISDN"))                   return "WALLET_NOT_FOUND";
  if (code.includes("LIMIT") || code.includes("AMOUNT_LIMIT"))              return "LIMIT_EXCEEDED";
  if (code.includes("BALANCE") || code.includes("INSUFFICIENT"))            return "INSUFFICIENT_FUNDS";
  return "TRANSFER_FAILED";
}

// ── Push a tarjeta Visa/MC/UnionPay (Visa Direct + Mastercard Send) ────────────

export async function executeNiumCard(
  apiKey:          string,
  clientHashId:    string,
  recipientName:   string,
  cardNumber:      string,   // 16 dígitos sin espacios
  targetCountry:   string,
  targetCurrency:  string,
  sourceAmountCAD: number,
): Promise<string> {
  const cleanCard = cardNumber.replace(/\s/g, "");
  const [firstName, ...rest] = recipientName.trim().split(" ");
  const lastName = rest.join(" ") || firstName;

  const res = await fetch(`${NIUM_BASE}/api/v1/client/${clientHashId}/payout/card`, {
    method: "POST",
    headers: {
      "x-api-key":    apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uniqueReferenceNumber:  crypto.randomUUID(),
      transactionCurrency:    "CAD",
      transactionAmount:      sourceAmountCAD,
      destinationCurrency:    targetCurrency,
      destinationCountry:     targetCountry.toUpperCase(),
      beneficiaryName:        recipientName.trim(),
      beneficiaryFirstName:   firstName,
      beneficiaryLastName:    lastName,
      cardNumber:             cleanCard,
      purposeCode:            "FAMILY_SUPPORT",
    }),
  });

  const data = await res.json() as NiumResponse;

  if (!res.ok || (!data.uniqueTransactionNumber && !data.transactionId)) {
    const code = data.errorCode ?? data.errors?.[0]?.code ?? "TRANSFER_FAILED";
    throw Object.assign(
      new Error(data.message ?? data.errors?.[0]?.message ?? `Nium card error ${res.status}`),
      { code: mapNiumError(code) },
    );
  }

  return data.uniqueTransactionNumber ?? data.transactionId ?? crypto.randomUUID();
}

// ── Push a wallet móvil (M-Pesa, GCash, bKash, Orange Money…) ─────────────────

// Nium mapea el operador por (destinationCountry + walletType).
// Si el operador exacto no está disponible en un país, Nium retorna WALLET_NOT_FOUND.
function resolveWalletType(countryCode: string): string {
  const map: Record<string, string> = {
    PH: "GCASH",      BD: "BKASH",      PK: "JAZZCASH",
    KE: "MPESA",      TZ: "MPESA",      ZM: "MPESA",
    UG: "MTN",        RW: "MTN",        CM: "MTN",
    GH: "MTN",        CI: "ORANGE",     SN: "ORANGE",
    BF: "ORANGE",     ML: "ORANGE",     ZW: "ECOCASH",
    ET: "TELEBIRR",   MW: "AIRTEL",     MZ: "MPESA",
    MM: "WAVEMONEY",  LB: "WHISH",      CN: "ALIPAY",
  };
  return map[countryCode.toUpperCase()] ?? "MOBILE_MONEY";
}

export async function executeNiumWallet(
  apiKey:          string,
  clientHashId:    string,
  recipientName:   string,
  walletId:        string,   // teléfono E.164 o ID del wallet
  targetCountry:   string,
  targetCurrency:  string,
  sourceAmountCAD: number,
): Promise<string> {
  const [firstName, ...rest] = recipientName.trim().split(" ");
  const lastName = rest.join(" ") || firstName;

  const res = await fetch(`${NIUM_BASE}/api/v1/client/${clientHashId}/payout/wallet`, {
    method: "POST",
    headers: {
      "x-api-key":    apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uniqueReferenceNumber:  crypto.randomUUID(),
      transactionCurrency:    "CAD",
      transactionAmount:      sourceAmountCAD,
      destinationCurrency:    targetCurrency,
      destinationCountry:     targetCountry.toUpperCase(),
      beneficiaryName:        recipientName.trim(),
      beneficiaryFirstName:   firstName,
      beneficiaryLastName:    lastName,
      walletType:             resolveWalletType(targetCountry),
      mobileNumber:           walletId.startsWith("+") ? walletId : `+${walletId.replace(/\D/g, "")}`,
      purposeCode:            "FAMILY_SUPPORT",
    }),
  });

  const data = await res.json() as NiumResponse;

  if (!res.ok || (!data.uniqueTransactionNumber && !data.transactionId)) {
    const code = data.errorCode ?? data.errors?.[0]?.code ?? "TRANSFER_FAILED";
    throw Object.assign(
      new Error(data.message ?? data.errors?.[0]?.message ?? `Nium wallet error ${res.status}`),
      { code: mapNiumError(code) },
    );
  }

  return data.uniqueTransactionNumber ?? data.transactionId ?? crypto.randomUUID();
}
