import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Flutterwave — África (NG, GH, KE, TZ, UG, ZA, SN, CI, CM, RW, ET, EG)
// Soporta: M-Pesa, MTN Mobile Money, Airtel, USSD, transferencias bancarias locales
// Registro: dashboard.flutterwave.com — disponible para individuos
// Docs: developer.flutterwave.com/docs/payouts

// Mapeo de nombre de banco/billetera → código Flutterwave
const FLW_BANK_CODES: Record<string, string> = {
  // Kenya
  "M-Pesa":              "MPS",
  "Airtel Kenya":        "ATL",
  "T-Kash":              "TKASH",
  // Nigeria
  "Access Bank":         "044",
  "GTBank":              "058",
  "Zenith Bank":         "057",
  "First Bank":          "011",
  "UBA":                 "033",
  "Fidelity Bank":       "070",
  "Union Bank":          "032",
  // Ghana
  "MTN Ghana":           "MTN",
  "Vodafone Cash":       "VDF",
  "AirtelTigo":          "ATL",
  // Uganda
  "MTN Uganda":          "MTN",
  "Airtel Uganda":       "ATL",
  // Tanzania
  "M-Pesa Tanzania":     "MPS",
  "Tigo Pesa":           "TIGOPESA",
  "Airtel Tanzania":     "ATL",
  // South Africa
  "Standard Bank":       "051",
  "ABSA":                "632005",
  "FNB":                 "250655",
  "Nedbank":             "198765",
  // Senegal / Ivory Coast / Cameroon
  "Orange Money":        "OM",
  "Wave":                "WAVE",
};

// Determina si el token es un número de teléfono (mobile money) o cuenta bancaria
function isMobileMoneyCountry(country: string): boolean {
  return ["KE","TZ","UG","GH","SN","CI","CM","RW"].includes(country.toUpperCase());
}

export async function POST(req: NextRequest) {
  try {
    const {
      amount, currency, targetCurrency,
      bankToken, bankName, country, receiverName, feeAmount,
    } = await req.json() as {
      amount: number; currency: string; targetCurrency?: string;
      bankToken: string; bankName: string; country: string;
      receiverName: string; feeAmount?: number;
    };

    const secretKey = process.env.FLW_SECRET_KEY ?? "";
    if (!secretKey) {
      return NextResponse.json({ error: "Flutterwave not configured" }, { status: 503 });
    }

    const netAmount   = amount - (feeAmount ?? amount * 0.0025);
    const destCurrency = targetCurrency || currency;
    const reference   = `OP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Determine bank/mobile code
    const bankCode = FLW_BANK_CODES[bankName]
      ?? (isMobileMoneyCountry(country) ? "MPS" : "000");

    const body: Record<string, unknown> = {
      account_bank:    bankCode,
      account_number:  bankToken,      // phone for mobile money, acct number for banks
      amount:          parseFloat(netAmount.toFixed(2)),
      currency:        destCurrency,
      narration:       "OmniPay Transfer",
      reference,
      debit_currency:  "USD",          // Flutterwave debits your USD balance
      beneficiary_name: receiverName,
      meta: [{ sender: "OmniPay", mobile_number: bankToken }],
    };

    const res = await fetch("https://api.flutterwave.com/v3/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      status: string;
      data?: { id: string; status: string };
      message?: string;
    };

    if (!res.ok || data.status !== "success") {
      console.error("Flutterwave transfer error:", data);
      return NextResponse.json({ error: data.message ?? "Flutterwave error" }, { status: 400 });
    }

    return NextResponse.json({
      tx_id:  String(data.data?.id ?? reference),
      status: "pending",
    });
  } catch (err) {
    console.error("Flutterwave route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
