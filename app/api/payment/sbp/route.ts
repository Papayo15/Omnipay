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

    const base = getBaseURL("sbp");
    const headers = buildAuthHeaders("sbp");
    const corporate = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";
    const netAmount = (amount - feeAmount).toFixed(2);

    // SBP vía nodo puente (Emiratos/Asia Central)
    const res = await fetch(`${base}/v1/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipient_phone: receiverToken, // SBP usa teléfono como identificador
        amount: parseFloat(netAmount),
        currency: "RUB",
        original_currency: currency,
        description: "OmniPay Transfer via SBP",
        ref_id: `OP_${Date.now()}`,
      }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return Response.json({ error: "SBP bridge error" }, { status: 400 });
    }

    // Comisión a OmniPay
    fetch(`${base}/v1/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipient_phone: corporate,
        amount: feeAmount,
        currency: "RUB",
        description: "OmniPay Commission",
        ref_id: `OP_FEE_${Date.now()}`,
      }),
    }).catch(() => {});

    return Response.json(normalizeStatus("sbp", data));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
