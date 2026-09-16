// POST /api/conduit/sandbox/simulate-deposit
// Simulates a fiat deposit into a Conduit VA — sandbox only.
// Body: { customerId, vaId, amount, currency? }

import { NextRequest, NextResponse } from "next/server";
import { conduitRequest, isConduitSandbox } from "@/lib/conduit/client";

export const runtime = "nodejs";

interface SimulateBody {
  customerId: string;
  vaId:       string;
  amount:     number;
  currency?:  string;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isConduitSandbox()) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  let body: SimulateBody;
  try { body = await req.json() as SimulateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { customerId, vaId, amount, currency = "USD" } = body;
  if (!customerId || !vaId || !amount) {
    return NextResponse.json({ error: "customerId, vaId and amount are required" }, { status: 400 });
  }

  try {
    const result = await conduitRequest(
      "POST",
      `/sandbox/customers/${customerId}/virtual-accounts/${vaId}/deposits/simulate`,
      { amount: amount.toFixed(2), currency },
    );
    return NextResponse.json({ success: true, result });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
