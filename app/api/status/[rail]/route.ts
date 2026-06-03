import { buildAuthHeaders, getBaseURL, normalizeStatus, type Rail } from "@/lib/rails/router";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ rail: string }> }
) {
  try {
    const { rail } = await params;
    const url = new URL(request.url);
    const txId = url.searchParams.get("tx_id");

    if (!txId) {
      return Response.json({ error: "tx_id required" }, { status: 400 });
    }

    const r = rail as Rail;
    const base = getBaseURL(r);
    const headers = buildAuthHeaders(r);

    let bankRes: Response;

    switch (r) {
      case "belvo":
        bankRes = await fetch(`${base}/api/payment-intents/${txId}/`, { headers });
        break;
      case "plaid":
        bankRes = await fetch(`${base}/transfer/get`, {
          method: "POST",
          headers,
          body: JSON.stringify({ transfer_id: txId }),
        });
        break;
      case "tink":
        bankRes = await fetch(`${base}/api/v1/pay/paymentrequests/${txId}`, { headers });
        break;
      case "alipay":
        bankRes = await fetch(
          `${base}/gateway.do?method=alipay.trade.query&trade_no=${txId}&app_id=${process.env.ALIPAY_APP_ID}`,
          { headers }
        );
        break;
      case "sbp":
        bankRes = await fetch(`${base}/v1/transfer/${txId}/status`, { headers });
        break;
      case "dlocalgo":
        bankRes = await fetch(`${base}/v1/payouts/${txId}`, { headers });
        break;
      case "stablecoin":
        bankRes = await fetch(`${base}/v1/paymentIntents/${txId}`, { headers });
        break;
      default:
        return Response.json({ status: "pending", tx_id: txId });
    }

    const data = await bankRes.json() as Record<string, unknown>;
    return Response.json(normalizeStatus(r, data));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
