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

    const base = getBaseURL("tink");
    const headers = buildAuthHeaders("tink");
    const corporate = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";

    const netAmount = (amount - feeAmount).toFixed(2);

    const res = await fetch(`${base}/api/v1/pay/paymentrequests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        currency,
        amount: { value: parseFloat(netAmount) * 100, scale: 2 }, // Tink usa centavos
        market: "SE", // ajustar según país
        recipientName: "OmniPay Receptor",
        sourceMessage: "Pago via OmniPay",
        accountNumber: receiverToken,
        accountNumberType: "IBAN",
      }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return Response.json({ error: "Tink error" }, { status: 400 });
    }

    // Enviar comisión a OmniPay (fire & forget)
    fetch(`${base}/api/v1/pay/paymentrequests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        currency,
        amount: { value: Math.round(feeAmount * 100), scale: 2 },
        recipientName: "OmniPay Corp",
        accountNumber: corporate,
        accountNumberType: "IBAN",
        sourceMessage: "OmniPay Commission",
      }),
    }).catch(() => {});

    return Response.json(normalizeStatus("tink", data));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
