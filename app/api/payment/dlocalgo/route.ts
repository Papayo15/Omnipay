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

    const base = getBaseURL("dlocalgo");
    const headers = buildAuthHeaders("dlocalgo");
    const corporate = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";
    const netAmount = (amount - feeAmount).toFixed(2);

    const res = await fetch(`${base}/v1/payouts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        login: process.env.DLOCALGO_API_KEY,
        amount: parseFloat(netAmount),
        currency,
        description: "OmniPay Transfer",
        beneficiary: {
          name: "Receptor OmniPay",
          account: receiverToken,
        },
        external_id: `OP_${Date.now()}`,
      }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return Response.json({ error: "dLocalGo error" }, { status: 400 });
    }

    // Comisión a OmniPay
    fetch(`${base}/v1/payouts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        login: process.env.DLOCALGO_API_KEY,
        amount: feeAmount,
        currency,
        description: "OmniPay Commission",
        beneficiary: { name: "OmniPay Corp", account: corporate },
        external_id: `OP_FEE_${Date.now()}`,
      }),
    }).catch(() => {});

    return Response.json(normalizeStatus("dlocalgo", data));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
