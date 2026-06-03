import { buildAuthHeaders, getBaseURL } from "@/lib/rails/router";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { user_id } = await request.json() as { user_id?: string };

    const base = getBaseURL("plaid");
    const headers = buildAuthHeaders("plaid");

    const res = await fetch(`${base}/link/token/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_name: "OmniPay Protocol",
        country_codes: ["US", "CA"],
        language: "es",
        user: { client_user_id: user_id ?? `anon_${Date.now()}` },
        products: ["auth", "transfer"],
      }),
    });

    const data = await res.json() as { link_token: string; expiration: string };
    if (!res.ok) {
      return Response.json({ error: "Plaid link token error" }, { status: 400 });
    }

    return Response.json({ link_token: data.link_token, expiration: data.expiration });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
