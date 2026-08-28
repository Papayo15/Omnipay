// POST /api/bridge/sandbox/simulate-kyc
// Body: { customer_id: string, type?: "individual" | "business" }
//
// Sandbox-only: simulates KYC/KYB approval for a Bridge customer so the sender
// can continue their flow without a real Bridge identity verification redirect.
// Returns 403 in production.

import { NextRequest, NextResponse } from "next/server";
import {
  getCustomer, ensureEndorsements, createKycLink,
  simulateKycApproval,
} from "@/providers/bridge/customers";

export const runtime = "nodejs";

const ENDORSEMENTS = ["base", "sepa", "spei", "pix", "faster_payments", "cop"];

export async function POST(req: NextRequest): Promise<Response> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  if (!isSandbox) {
    return NextResponse.json({ error: "This endpoint is sandbox-only." }, { status: 403 });
  }

  let body: { customer_id?: string; type?: "individual" | "business" };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { customer_id, type = "individual" } = body;
  if (!customer_id) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }

  try {
    try { await ensureEndorsements(customer_id, ENDORSEMENTS); } catch { /* best-effort */ }
    try {
      const c = await getCustomer(customer_id);
      const name = type === "business"
        ? (c.business_name ?? c.first_name ?? "Business")
        : `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Customer";
      await createKycLink({ full_name: name, email: c.email, type, endorsements: ENDORSEMENTS });
    } catch { /* dup ok — customer may already have a KYC link */ }

    try { await simulateKycApproval(customer_id); } catch { /* already approved ok */ }

    // Poll until Bridge propagates the status change (up to ~8s)
    let active = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const verified = await getCustomer(customer_id);
        active = verified.status === "active"
          || verified.kyc_status === "approved"
          || (verified as unknown as Record<string, string>).kyb_status === "approved";
        if (active) break;
        if (i === 3) { try { await simulateKycApproval(customer_id); } catch { /* retry */ } }
      } catch { break; }
    }

    if (!active) {
      return NextResponse.json({
        error: "El cliente no pudo activarse en Bridge sandbox. Intenta de nuevo.",
      }, { status: 422 });
    }

    return NextResponse.json({ ok: true, customer_id, status: "active" });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message ?? "Error interno" }, { status: 500 });
  }
}
