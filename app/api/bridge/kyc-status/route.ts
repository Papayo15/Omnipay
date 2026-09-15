// GET /api/bridge/kyc-status?customer_id=xxx
// Polled by the frontend every 2 s while the user is on Bridge's KYC page
// Returns { approved: boolean, status: string, rejection_reason?: string | null }

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
    // Extract rejection reasons if Bridge provides them (field varies by API version)
    const rawReasons = (c.rejection_reasons as string[] | undefined)
      ?? (c.reasons as string[] | undefined);
    const rejection_reason = rawReasons?.[0] ?? null;
    return NextResponse.json({ approved, status: kycStatus ?? baseStatus ?? "unknown", rejection_reason });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404 || err.message?.includes("not found") || err.message?.includes("404")) {
      return NextResponse.json({ approved: false, status: "not_found", not_found: true });
    }
    console.error("[kyc-status]", err.message);
    return NextResponse.json({ approved: false, status: "unknown", error: err.message });
  }
}
