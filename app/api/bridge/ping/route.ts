import { NextResponse } from "next/server";
export const runtime = "edge";
export async function GET(): Promise<Response> {
  const key = process.env.BRIDGE_API_KEY ?? "";
  const res = await fetch("https://api.sandbox.bridge.xyz/v0/customers?limit=1", {
    headers: { "Api-Key": key },
  });
  const data = await res.json();
  return NextResponse.json({
    key_present:   key.length > 0,
    key_length:    key.length,
    key_prefix:    key.slice(0, 10),
    bridge_status: res.status,
    bridge_ok:     res.ok,
    bridge_error:  res.ok ? null : data,
  });
}
