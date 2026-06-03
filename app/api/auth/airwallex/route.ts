import { NextResponse } from "next/server";
import { getAirwallexToken } from "@/lib/rails/router";

export const runtime = "edge";

export async function GET() {
  if (!process.env.AIRWALLEX_CLIENT_ID || !process.env.AIRWALLEX_API_KEY) {
    return NextResponse.json({ ok: false, error: "Airwallex credentials not set" }, { status: 503 });
  }

  try {
    const token = await getAirwallexToken();
    return NextResponse.json({ ok: !!token });
  } catch {
    return NextResponse.json({ ok: false, error: "Auth failed" }, { status: 401 });
  }
}
