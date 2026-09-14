// GET /api/bridge/tos-status?customer_id=xxx
// Polled by the frontend every 3 s while the user accepts Bridge ToS in a popup.
// Returns { accepted: boolean, status: string }

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
    const customer  = await getCustomer(customerId);
    const c         = customer as unknown as Record<string, unknown>;
    const tosStatus = c.tos_status as string | undefined;
    // Bridge uses "accepted", "approved", or "not_required" once ToS is done.
    // Any value other than "pending" / undefined means we can proceed.
    const tosAccepted = tosStatus !== undefined && tosStatus !== null
      && tosStatus !== "pending" && tosStatus !== "";
    const customerActive = customer.status === "active"
      || customer.status === "approved"
      || customer.status === "under_review"; // ToS done, KYC in progress
    const accepted = tosAccepted || customerActive;
    return NextResponse.json({ accepted, tos_status: tosStatus ?? "pending" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
