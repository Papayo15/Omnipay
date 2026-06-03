import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Wise Canadá — riel de respaldo y receptor de comisiones OmniPay
// Balances: CAD (Transit / Institution / Account) y USD
// API: https://api.transferwise.com/v1/

interface WisePayoutRequest {
  amount: number;
  currency: string;
  targetCurrency?: string;
  bankToken: string;     // número de cuenta o token destino
  bankName?: string;
  country: string;
  receiverName: string;
  paymentIntentId?: string;
  feeAmount?: number;
}

async function wisePost(path: string, body: unknown) {
  const token = process.env.WISE_API_TOKEN ?? "";
  const res = await fetch(`https://api.transferwise.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Wise${path} failed: ${err}`);
  }
  return res.json();
}

async function wiseGet(path: string) {
  const token = process.env.WISE_API_TOKEN ?? "";
  const res = await fetch(`https://api.transferwise.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Wise GET ${path} failed`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const data: WisePayoutRequest = await req.json();
    const profileId = process.env.WISE_PROFILE_ID ?? "";
    const apiToken  = process.env.WISE_API_TOKEN  ?? "";

    if (!apiToken || !profileId) {
      return NextResponse.json({ error: "Wise not configured" }, { status: 503 });
    }

    // 1. Crear cuenta del beneficiario
    const recipient = await wisePost("/v1/accounts", {
      currency:          data.targetCurrency || data.currency,
      type:              "sort_code",
      profile:           profileId,
      accountHolderName: data.receiverName,
      details: {
        accountNumber: data.bankToken,
        sortCode:      data.bankToken.slice(0, 6),
      },
    }) as { id: number };

    // 2. Crear quote de transferencia
    const quote = await wisePost("/v3/profiles/" + profileId + "/quotes", {
      sourceCurrency: data.currency.toUpperCase(),
      targetCurrency: (data.targetCurrency || data.currency).toUpperCase(),
      sourceAmount:   data.amount,
      targetAccount:  recipient.id,
    }) as { id: string };

    // 3. Crear transferencia
    const transfer = await wisePost("/v1/transfers", {
      targetAccount:       recipient.id,
      quoteUuid:           quote.id,
      customerTransactionId: data.paymentIntentId ?? crypto.randomUUID(),
      details: {
        reference: "OmniPay",
      },
    }) as { id: number; status: string };

    // 4. Fondear la transferencia
    await wisePost(`/v3/profiles/${profileId}/transfers/${transfer.id}/payments`, {
      type: "BALANCE",
    });

    // 5. Verificar estado
    const status = await wiseGet(`/v1/transfers/${transfer.id}`) as { status: string };

    return NextResponse.json({
      tx_id:       String(transfer.id),
      transfer_id: String(transfer.id),
      status:      status.status === "outgoing_payment_sent" ? "completed" : "pending",
    });
  } catch (err) {
    console.error("Wise payout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wise error" },
      { status: 500 }
    );
  }
}
