// GET /api/bridge/kyc-link?customer_id=xxx&redirect_uri=yyy
//
// Returns the Bridge KYC link for an existing customer.
// Called from the frontend after ToS acceptance to get the KYC URL directly,
// bypassing the full checkout flow (which could race on has_accepted_terms_of_service).

import { NextRequest, NextResponse } from "next/server";
import { getKycLink, getCustomer, createKycLink } from "@/providers/bridge/customers";

export async function GET(req: NextRequest): Promise<Response> {
  const p           = req.nextUrl.searchParams;
  const customer_id = p.get("customer_id");
  const redirect_uri = p.get("redirect_uri");

  if (!customer_id) {
    return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  }

  try {
    let url: string | null = null;
    // Try GET /customers/{id}/kyc_link first (customer-scoped)
    try {
      const link = await getKycLink(customer_id, { redirect_uri: redirect_uri ?? undefined });
      url = (link as unknown as Record<string, string>).kyc_link ?? link.url ?? null;
      console.log(`[kyc-link] getKycLink customer=${customer_id} url=${url}`);
    } catch (e1) {
      console.error(`[kyc-link] getKycLink error: ${(e1 as Error).message}`);
    }
    // Fallback: POST /kyc_links using customer info
    if (!url) {
      const customer = await getCustomer(customer_id);
      const c = customer as unknown as Record<string, string>;
      const fullName = c.full_name ?? c.business_name ?? "Unknown";
      const email    = c.email ?? "";
      const type     = (c.type === "business") ? "business" : "individual";
      const fb = await createKycLink({
        full_name: fullName, email, type,
        endorsements: ["base", "sepa", "spei", "pix", "faster_payments", "cop"],
        redirect_uri: redirect_uri ?? undefined,
      });
      url = fb.url ?? (fb as unknown as Record<string, string>).kyc_link ?? null;
      console.log(`[kyc-link] createKycLink fallback customer=${customer_id} url=${url}`);
    }
    if (!url) {
      return NextResponse.json({ error: "Bridge returned no KYC link URL" }, { status: 502 });
    }
    return NextResponse.json({ kyc_url: url });
  } catch (e) {
    const err = e as Error;
    console.error(`[kyc-link] error: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
