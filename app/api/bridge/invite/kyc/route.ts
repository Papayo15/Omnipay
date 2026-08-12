// POST /api/bridge/invite/kyc
// Decifra el token de invitación y prepara el KYC para el receptor.
//
// Sandbox: crea el cliente Bridge + simula KYC server-side → devuelve {} sin URL
//          (el frontend avanza a "done" inmediatamente y el polling del emisor resuelve)
// Producción: genera ToS link → KYC link con redirect_uri de regreso a /recibir
//
// Body: { token: string, redirect_uri: string }

import { NextRequest, NextResponse } from "next/server";
import {
  createTosLink, createKycLink, findCustomerByEmail,
  getOrCreateCustomer, patchCustomerAddress, ensureEndorsements, simulateKycApproval,
} from "@/providers/bridge/customers";

export const runtime = "nodejs"; // needs setTimeout for sandbox delay

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
  const ciphertext = packed.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: { token?: string; redirect_uri?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { token, redirect_uri } = body;
  if (!token || !redirect_uri) {
    return NextResponse.json({ error: "token and redirect_uri are required" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try { payload = await decryptInvite(token); }
  catch { return NextResponse.json({ error: "Invalid or tampered token" }, { status: 400 }); }

  if (Date.now() > (payload.exp as number)) {
    return NextResponse.json({ error: "Invite token has expired" }, { status: 410 });
  }

  const full_name = payload.recipient_name as string;
  const email    = (payload.recipient_email as string).toLowerCase();
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

  // If customer already exists, no need for ToS/KYC flow
  const existing = await findCustomerByEmail(email).catch(() => null);
  if (existing && (existing.status === "active" || existing.kyc_status === "approved")) {
    return NextResponse.json({ status: "already_active" });
  }

  const endorsements = ["base", "sepa", "spei", "pix", "faster_payments", "cop"];
  const country = (payload.recipient_country as string | undefined ?? "US").toUpperCase();
  const ISO3: Record<string, string> = {
    MX:"MEX",US:"USA",BR:"BRA",CO:"COL",GB:"GBR",CA:"CAN",
    DE:"DEU",FR:"FRA",ES:"ESP",IT:"ITA",NL:"NLD",PT:"PRT",
  };

  // SANDBOX: simulate KYC server-side — no redirect needed
  if (isSandbox) {
    try {
      const { customer } = await getOrCreateCustomer({
        type:       "individual",
        email,
        first_name: full_name.split(" ")[0],
        last_name:  full_name.split(" ").slice(1).join(" ") || "-",
        country:    ISO3[country] ?? "USA",
        endorsements,
      });
      try { await patchCustomerAddress(customer.id, country, true); } catch { /* best-effort */ }
      try { await ensureEndorsements(customer.id, endorsements); }   catch { /* ignore */ }
      try { await createKycLink({ full_name, email, type: "individual", endorsements }); } catch { /* dup ok */ }
      try { await simulateKycApproval(customer.id); } catch { /* already approved ok */ }
      await new Promise(r => setTimeout(r, 1500)); // let Bridge propagate status
      return NextResponse.json({ status: "sandbox_approved" }); // no kyc_url → frontend goes to "done"
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // PRODUCTION: ToS link → KYC link with redirect
  try {
    const tos = await createTosLink({ full_name, email, type: "individual", redirect_uri });
    return NextResponse.json({ tos_url: tos.url });
  } catch { /* fall through to KYC link */ }

  try {
    const kyc = await createKycLink({
      full_name, email, type: "individual", endorsements, redirect_uri,
    });
    const url = (kyc as unknown as Record<string, string>).kyc_link ?? kyc.url ?? null;
    if (!url) throw new Error("No URL in KYC response");
    return NextResponse.json({ kyc_url: url });
  } catch (e) {
    const err = e as Error & { type?: string; details?: Record<string, unknown> };
    if (err.type === "duplicate_record") {
      const ex = err.details?.existing_kyc_link as { kyc_link?: string; url?: string } | undefined;
      const url = ex?.kyc_link ?? ex?.url ?? null;
      if (url) return NextResponse.json({ kyc_url: url });
    }
    return NextResponse.json({ error: err.message ?? "Failed to generate KYC link" }, { status: 500 });
  }
}
