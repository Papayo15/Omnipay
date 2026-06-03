import { NextRequest, NextResponse } from "next/server";
import { getAirwallexToken, getBaseURL } from "@/lib/rails/router";

export const runtime = "edge";

interface AirwallexTransferRequest {
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
  bankToken: string;       // card 16 digits, phone number, or account number
  bankName: string;
  country: string;
  receiverName: string;
  feeAmount?: number;
}

// Detect beneficiary type from bankToken:
// - 16 digits       → UnionPay / local bank card (LOCAL transfer)
// - phone (+xx...)  → Alipay / WeChat Pay push
// - otherwise       → local bank account
function detectAirwallexMethod(bankToken: string, country: string): {
  paymentMethod: string;
  beneficiary: Record<string, unknown>;
} {
  const digits = bankToken.replace(/\s/g, "");
  const isCard  = /^\d{16}$/.test(digits);
  const isPhone = /^\+?\d{10,15}$/.test(bankToken.trim());

  if (isPhone && (country === "CN" || country === "HK" || country === "TW")) {
    return {
      paymentMethod: "ALIPAY",
      beneficiary: { alipay_id: bankToken.trim() },
    };
  }

  return {
    paymentMethod: "LOCAL",
    beneficiary: {
      bank_details: {
        account_name: "",           // filled by caller
        account_number: isCard ? digits : bankToken,
        bank_country_code: country,
        ...(isCard ? { card_number: digits } : {}),
      },
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const data: AirwallexTransferRequest = await req.json();
    if (!process.env.AIRWALLEX_CLIENT_ID || !process.env.AIRWALLEX_API_KEY) {
      return NextResponse.json({ error: "Airwallex not configured" }, { status: 503 });
    }

    const token   = await getAirwallexToken();
    const base    = getBaseURL("airwallex");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const { paymentMethod, beneficiary } = detectAirwallexMethod(data.bankToken, data.country);

    // Fill account name in bank_details if present
    if (beneficiary.bank_details) {
      (beneficiary.bank_details as Record<string, unknown>).account_name = data.receiverName;
    }

    const requestId = crypto.randomUUID();
    const createRes = await fetch(`${base}/api/v1/transfers/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        request_id: requestId,
        source_currency: data.sourceCurrency,
        payment_currency: data.targetCurrency,
        amount: data.amount,
        payment_method: paymentMethod,
        beneficiary,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Airwallex create failed: ${err}`);
    }

    const created = await createRes.json() as { id: string; status: string };

    const submitRes = await fetch(`${base}/api/v1/transfers/${created.id}/submit`, {
      method: "POST",
      headers,
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      throw new Error(`Airwallex submit failed: ${err}`);
    }

    const submitted = await submitRes.json() as { id: string; status: string };
    return NextResponse.json({ tx_id: submitted.id, status: "pending" });
  } catch (err) {
    console.error("Airwallex payment error:", err);
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}
