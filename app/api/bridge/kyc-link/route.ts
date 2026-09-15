// GET /api/bridge/kyc-link?customer_id=xxx&redirect_uri=yyy
//
// Returns the Bridge KYC link for an existing customer.
// Called from the frontend after ToS acceptance to get the KYC URL directly,
// bypassing the full checkout flow (which could race on has_accepted_terms_of_service).

import { NextRequest, NextResponse } from "next/server";
import { getKycLink } from "@/providers/bridge/customers";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  const p           = req.nextUrl.searchParams;
  const customer_id = p.get("customer_id");
  const redirect_uri = p.get("redirect_uri");

  if (!customer_id) {
    return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  }

  try {
    const link = await getKycLink(customer_id, {
      redirect_uri: redirect_uri ?? undefined,
    });
    const url = (link as unknown as Record<string, string>).kyc_link ?? link.url ?? null;
    console.log(`[kyc-link] customer=${customer_id} url=${url}`);
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
