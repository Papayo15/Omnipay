// POST /api/internal/bridge-diag
//
// Internal diagnostic — checks Bridge API key + KYC status of any customer.
// Does NOT create virtual accounts, liquidation addresses, or initiate any transfer.
//
// Protected by DIAG_SECRET env var (set a long random string in Vercel).
// Usage: POST with { "email": "user@example.com", "country"?: "MX" }
//        Header: Authorization: Bearer <DIAG_SECRET>
//
// Returns: full customer record + endorsements + KYC link test (no real money)

import { NextRequest, NextResponse } from "next/server";
import { findCustomerByEmail, createKycLink, getOrCreateCustomer } from "@/providers/bridge/customers";

export const runtime = "edge";

export async function POST(req: NextRequest): Promise<Response> {
  // Auth check
  const secret = process.env.DIAG_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DIAG_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; country?: string; create_if_missing?: boolean };
  try { body = await req.json(); } catch { body = {}; }

  const email   = (body.email ?? "").toLowerCase().trim();
  const country = (body.country ?? "MX").toUpperCase();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const result: Record<string, unknown> = { email, country, timestamp: new Date().toISOString() };

  // 1. Check Bridge API key by looking up the customer
  try {
    const existing = await findCustomerByEmail(email);

    if (existing) {
      result.customer_found     = true;
      result.customer_id        = existing.id;
      result.customer_status    = existing.status;
      result.kyc_status         = existing.kyc_status;
      result.kyb_status         = existing.kyb_status ?? null;
      result.type               = existing.type;
      result.created_at         = existing.created_at;

      // Determine if this customer would pass the KYC gate
      const kycApproved = existing.status === "active" || existing.kyc_status === "approved";
      result.would_pass_kyc_gate = kycApproved;
      result.needs_kyc           = !kycApproved;

      if (!kycApproved) {
        result.diagnosis = "KYC not yet approved — user would be sent to verification";
        // Try to get/create a KYC link to confirm the link works
        try {
          const kycLink = await createKycLink({
            full_name:    email.split("@")[0],
            email,
            type:         "individual",
            endorsements: ["base", "sepa"],
            redirect_uri: `${appUrl}/p2p?kyc_done=1`,
          });
          result.kyc_link_ok  = true;
          result.kyc_link_url = (kycLink as Record<string, unknown>).kyc_link ?? kycLink.url ?? "(see full_response)";
          result.kyc_link_raw = kycLink;
        } catch (kycErr) {
          const e = kycErr as Error & { type?: string };
          result.kyc_link_ok    = false;
          result.kyc_link_error = e.message;
          result.kyc_link_type  = e.type;
          if (e.type === "duplicate_record") {
            result.kyc_link_note = "duplicate_record = KYC link already exists for this customer, Bridge is processing";
          }
        }
      } else {
        result.diagnosis = "KYC approved ✓ — this customer would proceed directly to payment link generation (no KYC asked again)";
      }

    } else {
      result.customer_found = false;
      result.needs_kyc      = true;
      result.diagnosis      = "No customer found for this email in Bridge — first transfer will require KYC";

      if (body.create_if_missing) {
        // Create a test customer (KYC only, no liquidation address)
        const ISO3: Record<string, string> = {
          MX:"MEX", US:"USA", BR:"BRA", CO:"COL", GB:"GBR", CA:"CAN",
        };
        try {
          const { customer } = await getOrCreateCustomer({
            type:         "individual",
            email,
            first_name:   "Test",
            last_name:    "User",
            country:      ISO3[country] ?? "USA",
            endorsements: ["base", "sepa"],
          });
          result.customer_created = true;
          result.customer_id      = customer.id;
          result.customer_status  = customer.status;
          result.kyc_status       = customer.kyc_status;

          const kycLink = await createKycLink({
            full_name:    "Test User",
            email,
            type:         "individual",
            endorsements: ["base", "sepa"],
            redirect_uri: `${appUrl}/p2p?kyc_done=1`,
          });
          result.kyc_link_ok  = true;
          result.kyc_link_url = (kycLink as Record<string, unknown>).kyc_link ?? kycLink.url;
          result.kyc_link_raw = kycLink;
        } catch (createErr) {
          result.create_error = (createErr as Error).message;
        }
      }
    }

    // Sanity check: Bridge API key is working (we got here without auth error)
    result.bridge_api_key_ok = true;

  } catch (err) {
    const e = err as Error & { status?: number; type?: string };
    result.bridge_api_key_ok = false;
    result.error             = e.message;
    result.error_type        = e.type;
    result.error_status      = e.status;

    if (e.status === 401 || e.message?.toLowerCase().includes("unauthorized")) {
      result.diagnosis = "BRIDGE_API_KEY is missing or invalid — all Bridge calls will fail";
    } else {
      result.diagnosis = "Unexpected Bridge error — see error field";
    }
  }

  return NextResponse.json(result, { status: 200 });
}
