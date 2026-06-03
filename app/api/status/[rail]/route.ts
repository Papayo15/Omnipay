import { buildAuthHeaders, getBaseURL, normalizeStatus, type Rail } from "@/lib/rails/router";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ rail: string }> }
) {
  try {
    const { rail } = await params;
    const url  = new URL(request.url);
    const txId = url.searchParams.get("tx_id");

    if (!txId) {
      return Response.json({ error: "tx_id required" }, { status: 400 });
    }

    const r       = rail as Rail;
    const base    = getBaseURL(r);
    const headers = buildAuthHeaders(r);

    let bankRes: Response;

    switch (r) {
      case "wise":
        bankRes = await fetch(`${base}/v1/transfers/${txId}`, { headers });
        break;
      case "airwallex":
        bankRes = await fetch(`${base}/api/v1/transfers/${txId}`, { headers });
        break;
      case "binance_pay":
        bankRes = await fetch(`${base}/binancepay/openapi/v2/order/query?merchantTradeNo=${txId}`, { headers });
        break;
      default:
        // stripe / visa_direct — estado disponible en el dashboard; retornar pending
        return Response.json({ status: "pending", tx_id: txId });
    }

    const data = await bankRes.json() as Record<string, unknown>;
    return Response.json(normalizeStatus(r, data));
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
