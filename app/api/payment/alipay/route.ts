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

    const base = getBaseURL("alipay");
    const appId = process.env.ALIPAY_APP_ID ?? "";
    const netAmount = (amount - feeAmount).toFixed(2);
    const corporate = process.env.OMNIPAY_CORPORATE_ACCOUNT_TOKEN ?? "";

    const bizContent = JSON.stringify({
      out_trade_no: `OP_${Date.now()}`,
      subject: "OmniPay Transfer",
      total_amount: netAmount,
      buyer_id: receiverToken,
      currency,
    });

    const params = new URLSearchParams({
      app_id: appId,
      method: "alipay.trade.create",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      biz_content: bizContent,
    });

    const res = await fetch(`${base}/gateway.do`, {
      method: "POST",
      headers: buildAuthHeaders("alipay"),
      body: params.toString(),
    });

    const data = await res.json() as { alipay_trade_create_response?: Record<string, unknown> };
    const responseData = data.alipay_trade_create_response ?? {};

    if (responseData.code !== "10000") {
      return Response.json({ error: responseData.sub_msg ?? "Alipay error" }, { status: 400 });
    }

    // Comisión a OmniPay (fire & forget)
    fetch(`${base}/gateway.do`, {
      method: "POST",
      headers: buildAuthHeaders("alipay"),
      body: new URLSearchParams({
        app_id: appId,
        method: "alipay.trade.create",
        format: "JSON",
        charset: "utf-8",
        sign_type: "RSA2",
        timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
        version: "1.0",
        biz_content: JSON.stringify({
          out_trade_no: `OP_FEE_${Date.now()}`,
          subject: "OmniPay Commission",
          total_amount: feeAmount.toFixed(2),
          buyer_id: corporate,
          currency,
        }),
      }).toString(),
    }).catch(() => {});

    return Response.json(normalizeStatus("alipay", responseData));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
