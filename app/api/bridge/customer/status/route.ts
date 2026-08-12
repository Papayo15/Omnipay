// GET /api/bridge/customer/status?email=EMAIL
// Consulta el estado KYC de un customer Bridge por email.
// Retorna: { status: "active" | "pending" | "under_review" | "not_found" }
// Zero PII: no persiste nada.

import { NextRequest, NextResponse } from "next/server";
import { findCustomerByEmail } from "@/providers/bridge/customers";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const email = new URL(req.url).searchParams.get("email");
  if (!email) return NextResponse.json({ status: "not_found" });

  try {
    const customer = await findCustomerByEmail(email.toLowerCase());
    if (!customer) return NextResponse.json({ status: "not_found" });

    const kyc = customer.kyc_status ?? customer.kyb_status ?? "";
    const st  = customer.status ?? "";

    if (st === "active" || kyc === "approved") return NextResponse.json({ status: "active" });
    if (kyc === "under_review") return NextResponse.json({ status: "under_review" });
    if (kyc === "incomplete" || st === "under_review") return NextResponse.json({ status: "pending" });
    return NextResponse.json({ status: "not_found" });
  } catch {
    return NextResponse.json({ status: "not_found" });
  }
}
