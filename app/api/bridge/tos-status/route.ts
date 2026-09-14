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
    const tosAccepted = tosStatus !== undefined && tosStatus !== null
      && tosStatus !== "pending" && tosStatus !== "";
    const customerActive = customer.status === "active"
      || customer.status === "approved"
      || customer.status === "under_review";
    const accepted = tosAccepted || customerActive;
    return NextResponse.json({ accepted, tos_status: tosStatus ?? "pending" });
  } catch (e) {
    const err = e as Error & { status?: number };
    // 404 = customer not found (stale ID from a previous session) — return not-accepted
    // so polling continues gracefully instead of flooding the console with 500s
    if (err.status === 404 || err.message?.includes("not found") || err.message?.includes("404")) {
      return NextResponse.json({ accepted: false, tos_status: "pending", not_found: true });
    }
    console.error("[tos-status]", err.message);
    return NextResponse.json({ accepted: false, tos_status: "unknown", error: err.message });
  }
}
