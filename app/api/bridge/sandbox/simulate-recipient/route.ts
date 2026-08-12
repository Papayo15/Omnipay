// GET /api/bridge/sandbox/simulate-recipient?i=INVITE_TOKEN
//
// Sandbox-only: creates recipient Bridge customer + simulates KYC approval
// so the emisor's polling (/api/bridge/invite/status) can resolve immediately.
// Returns 403 in production.

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateCustomer, createKycLink,
  patchCustomerAddress, ensureEndorsements, simulateKycApproval,
} from "@/providers/bridge/customers";

export const runtime = "nodejs";

const IV_BYTES = 12;

async function decryptInvite(token: string): Promise<Record<string, unknown>> {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET not set");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":invite"));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const b = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - b.length % 4);
  const packed = Uint8Array.from(atob(b + pad), c => c.charCodeAt(0));
  const iv = packed.slice(0, IV_BYTES);
  const cipher = packed.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

export async function GET(req: NextRequest): Promise<Response> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  if (!isSandbox) {
    return NextResponse.json({ error: "This endpoint is sandbox-only." }, { status: 403 });
  }

  const token = new URL(req.url).searchParams.get("i");
  if (!token) return NextResponse.json({ error: "i= required" }, { status: 400 });

  let p: Record<string, unknown>;
  try { p = await decryptInvite(token); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }

  if (Date.now() > (p.exp as number)) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 });
  }

  const nombre  = p.recipient_name    as string;
  const email   = (p.recipient_email  as string).toLowerCase();
  const country = (p.recipient_country as string).toUpperCase();

  const ISO3: Record<string, string> = {
    MX:"MEX",US:"USA",BR:"BRA",CO:"COL",GB:"GBR",CA:"CAN",
    DE:"DEU",FR:"FRA",ES:"ESP",IT:"ITA",NL:"NLD",PT:"PRT",
  };

  const endorsements = ["base","sepa","spei","pix","faster_payments","cop"];

  try {
    const { customer } = await getOrCreateCustomer({
      type:       "individual",
      email,
      first_name: nombre.split(" ")[0],
      last_name:  nombre.split(" ").slice(1).join(" ") || "-",
      country:    ISO3[country] ?? "USA",
      endorsements,
    });

    try { await patchCustomerAddress(customer.id, country, true); } catch { /* best-effort */ }
    try { await ensureEndorsements(customer.id, endorsements); }   catch { /* ignore */ }
    try { await createKycLink({ full_name: nombre, email, type: "individual", endorsements }); } catch { /* dup ok */ }
    try { await simulateKycApproval(customer.id); } catch { /* already approved ok */ }

    // small delay so Bridge propagates the status change before polling hits
    await new Promise(r => setTimeout(r, 1500));

    return NextResponse.json({ ok: true, customer_id: customer.id, email });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
