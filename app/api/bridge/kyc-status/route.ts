// GET /api/bridge/kyc-status?customer_id=xxx
// Polled by the frontend every 2 s while the user is on Bridge's KYC page
// Returns { approved: boolean, status: string }

import { NextRequest, NextResponse } from "next/server";
import { getCustomer }               from "@/providers/bridge/customers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!customerId) {
    return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  }
  try {
    const customer = await getCustomer(customerId);
    const c          = customer as unknown as Record<string, unknown>;
    const kycStatus  = c.kyc_status as string | undefined;
    const kybStatus  = c.kyb_status as string | undefined;
    const baseStatus = customer.status;
    const approved   = baseStatus === "active" || baseStatus === "approved"
      || kycStatus === "approved" || kybStatus === "approved";
    return NextResponse.json({ approved, status: kycStatus ?? baseStatus ?? "unknown" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
