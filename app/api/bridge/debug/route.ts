// Temporary diagnostic endpoint — remove before production
import { NextRequest, NextResponse } from "next/server";
import { bridgeRequest } from "@/providers/bridge/client";
import { findCustomerByEmail } from "@/providers/bridge/customers";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

  try {
    const customer = await findCustomerByEmail(email);
    if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

    const full = await bridgeRequest<Record<string, unknown>>("GET", `/customers/${customer.id}`);

    return NextResponse.json({
      isSandbox:       (process.env.BRIDGE_API_BASE ?? "").includes("sandbox"),
      bridge_api_base: process.env.BRIDGE_API_BASE ?? "NOT SET",
      customer:        full,
    });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body   = await req.json() as { email?: string; customer_id?: string; action?: string; payload?: Record<string, unknown> };
    const email  = body.email;
    const action = body.action;

    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const customer = await findCustomerByEmail(email);
    if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

    if (action === "simulate_kyc") {
      const result = await bridgeRequest<unknown>(
        "POST",
        `/customers/${customer.id}/simulate_kyc_approval`,
      );
      // Re-fetch customer to see updated state
      const updated = await bridgeRequest<Record<string, unknown>>("GET", `/customers/${customer.id}`);
      return NextResponse.json({ action: "simulate_kyc_approval", result, updated_customer: updated });
    }

    if (action === "create_external_account") {
      // Raw external account creation — returns full Bridge response for debugging
      const payload = body.payload ?? {};
      const result = await bridgeRequest<unknown>(
        "POST",
        `/customers/${customer.id}/external_accounts`,
        payload,
        `debug-ext-${customer.id}-${Date.now()}`,
      );
      return NextResponse.json({ action: "create_external_account", customer_id: customer.id, result });
    }

    if (action === "list_external_accounts") {
      const result = await bridgeRequest<unknown>("GET", `/customers/${customer.id}/external_accounts`);
      return NextResponse.json({ action: "list_external_accounts", customer_id: customer.id, result });
    }

    if (action === "create_liquidation_address") {
      const payload = body.payload ?? {};
      const result = await bridgeRequest<unknown>(
        "POST",
        `/customers/${customer.id}/liquidation_addresses`,
        payload,
        `debug-liq-${customer.id}-${Date.now()}`,
      );
      return NextResponse.json({ action: "create_liquidation_address", customer_id: customer.id, result });
    }

    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    const err = e as Error & { type?: string; details?: unknown };
    return NextResponse.json({ error: err.message, type: err.type, details: err.details }, { status: 500 });
  }
}
