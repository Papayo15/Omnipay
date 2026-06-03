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

    const base = getBaseURL("belvo");
    const headers = buildAuthHeaders("belvo");
    const corporate = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";

    // Iniciamos dos payment intents en paralelo: al receptor y la comisión a OmniPay
    const [receiverRes, feeRes] = await Promise.all([
      fetch(`${base}/api/payment-intents/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: (amount - feeAmount).toFixed(2),
          currency,
          payment_method_details: {
            ofpi: { beneficiary_account: receiverToken },
          },
          provider: currency === "BRL" ? "pix" : "spei",
        }),
      }),
      fetch(`${base}/api/payment-intents/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: feeAmount.toFixed(2),
          currency,
          payment_method_details: {
            ofpi: { beneficiary_account: corporate },
          },
          provider: currency === "BRL" ? "pix" : "spei",
        }),
      }),
    ]);

    const receiverData = await receiverRes.json() as Record<string, unknown>;

    if (!receiverRes.ok) {
      return Response.json({ error: receiverData.detail ?? "Belvo error" }, { status: 400 });
    }

    return Response.json(normalizeStatus("belvo", receiverData));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
