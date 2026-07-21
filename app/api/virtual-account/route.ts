// Deprecated: use POST /api/bridge/pay instead.
// This endpoint is superseded by the Bridge-native pay flow.
import { NextResponse } from "next/server";
export const runtime = "edge";
export async function POST(): Promise<Response> {
  return NextResponse.json(
    { error: "Endpoint deprecated. Use POST /api/bridge/pay", moved_to: "/api/bridge/pay" },
    { status: 410 },
  );
}
