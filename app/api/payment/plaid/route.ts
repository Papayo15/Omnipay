import { buildAuthHeaders, getBaseURL, normalizeStatus } from "@/lib/rails/router";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { receiverToken, amount, feeAmount, currency } = await request.json() as {
      receiverToken: string;
      amount: number;
      feeAmount: number;
      currency: string;
    };

    const base = getBaseURL("plaid");
    const headers = buildAuthHeaders("plaid");
    const corporate = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";

    // Crear transferencia al receptor
    const res = await fetch(`${base}/transfer/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        access_token: receiverToken,
        account_id: receiverToken,
        type: "credit",
        network: "rtp", // RTP / FedNow según disponibilidad
        amount: (amount - feeAmount).toFixed(2),
        iso_currency_code: currency,
        description: "OmniPay Transfer",
        user: { legal_name: "OmniPay Sender" },
      }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return Response.json({ error: (data.error_message as string) ?? "Plaid error" }, { status: 400 });
    }

    // Transferir comisión a cuenta corporativa OmniPay (fire & forget)
    fetch(`${base}/transfer/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        access_token: corporate,
        account_id: corporate,
        type: "debit",
        network: "rtp",
        amount: feeAmount.toFixed(2),
        iso_currency_code: currency,
        description: "OmniPay Commission",
        user: { legal_name: "OmniPay" },
      }),
    }).catch(() => {});

    const transfer = data.transfer as Record<string, unknown>;
    return Response.json(normalizeStatus("plaid", { transfer }));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
