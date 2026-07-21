// Temporary diagnostic endpoint — remove before production
import { NextRequest, NextResponse } from "next/server";
import { bridgeRequest } from "@/providers/bridge/client";
import { findCustomerByEmail, simulateKycApproval } from "@/providers/bridge/customers";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

  const customer = await findCustomerByEmail(email);
  if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

  // Get full customer object with endorsements
  const full = await bridgeRequest<Record<string, unknown>>("GET", `/customers/${customer.id}`);

  return NextResponse.json({
    isSandbox: (process.env.BRIDGE_API_BASE ?? "").includes("sandbox"),
    bridge_api_base: process.env.BRIDGE_API_BASE ?? "NOT SET",
    customer: full,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const { email, action } = await req.json() as { email: string; action?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const customer = await findCustomerByEmail(email);
  if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

  if (action === "simulate_kyc") {
    const result = await bridgeRequest<unknown>("POST", `/customers/${customer.id}/simulate_kyc_approval`);
    return NextResponse.json({ action: "simulate_kyc_approval", result });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
