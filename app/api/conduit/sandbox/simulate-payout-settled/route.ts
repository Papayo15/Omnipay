// POST /api/conduit/sandbox/simulate-payout-settled
// Drives a sandbox payout to its terminal settlement state.
// Body: { payoutId, utr? }
// Fires: payout.completed webhook → handleConduitCompletion()

import { NextRequest, NextResponse } from "next/server";
import { conduitRequest, isConduitSandbox } from "@/lib/conduit/client";

export const runtime = "nodejs";

interface SimulateBody {
  payoutId: string;
  utr?:     string;  // optional unique transaction reference
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isConduitSandbox()) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  let body: SimulateBody;
  try { body = await req.json() as SimulateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { payoutId, utr } = body;
  if (!payoutId) {
    return NextResponse.json({ error: "payoutId is required" }, { status: 400 });
  }

  try {
    const result = await conduitRequest(
      "POST",
      `/sandbox/payouts/${payoutId}/simulate/settled`,
      utr ? { utr } : {},
    );
    return NextResponse.json({ success: true, result });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
