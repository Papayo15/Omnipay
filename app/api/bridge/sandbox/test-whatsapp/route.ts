// GET /api/bridge/sandbox/test-whatsapp
// Sandbox-only: sends a test WhatsApp message and returns full CallMeBot response for debugging.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest): Promise<Response> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  if (!isSandbox) return NextResponse.json({ error: "Sandbox only" }, { status: 403 });

  const phone  = process.env.ADMIN_WHATSAPP_PHONE ?? "";
  const apiKey = process.env.CALLMEBOT_API_KEY    ?? "";

  if (!phone || !apiKey) {
    return NextResponse.json({
      error:   "Missing env vars",
      phone:   phone ? `set (${phone.slice(0, 4)}***)` : "NOT SET",
      api_key: apiKey ? "set" : "NOT SET",
    }, { status: 500 });
  }

  const phoneClean = phone.replace(/^\+/, "");
  const message    = `🧪 OmniPay test WhatsApp ${new Date().toISOString()}`;
  const url        = `https://api.callmebot.com/whatsapp.php?phone=${phoneClean}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;

  try {
    const res  = await fetch(url);
    const body = await res.text();
    return NextResponse.json({
      ok:           res.status === 200,
      http_status:  res.status,
      phone_used:   phoneClean,
      api_key_used: `${apiKey.slice(0, 4)}***`,
      callmebot_response: body.slice(0, 500),
      url_called: url.replace(apiKey, "***"),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
