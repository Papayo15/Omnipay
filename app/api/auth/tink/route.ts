import { getBaseURL } from "@/lib/rails/router";

export const runtime = "edge";

export async function POST() {
  try {
    const base = getBaseURL("tink");
    const clientId = process.env.TINK_CLIENT_ID ?? "";
    const clientSecret = process.env.TINK_CLIENT_SECRET ?? "";

    // Obtener access token de cliente Tink
    const res = await fetch(`${base}/api/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "payment:write payment:read",
      }).toString(),
    });

    const data = await res.json() as { access_token: string; expires_in: number };
    if (!res.ok) {
      return Response.json({ error: "Tink auth error" }, { status: 400 });
    }

    return Response.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
