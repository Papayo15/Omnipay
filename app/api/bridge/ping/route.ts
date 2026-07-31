// GET /api/bridge/ping?key=ADMIN_SECRET
// Protected health check — verifies Bridge API connectivity.
import { NextRequest, NextResponse } from "next/server";
export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const adminKey = req.headers.get("x-admin-secret") ?? req.nextUrl.searchParams.get("key");
  if (!process.env.ADMIN_SECRET || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey  = process.env.BRIDGE_API_KEY ?? "";
  const apiBase = process.env.BRIDGE_API_BASE ?? "https://api.sandbox.bridge.xyz/v0";
  const isSandbox = apiBase.includes("sandbox");

  const res  = await fetch(`${apiBase}/customers?limit=1`, { headers: { "Api-Key": apiKey } });
  const data = await res.json();
  return NextResponse.json({
    key_present:   apiKey.length > 0,
    is_sandbox:    isSandbox,
    bridge_status: res.status,
    bridge_ok:     res.ok,
    bridge_error:  res.ok ? null : data,
  });
}
