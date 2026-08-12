// POST /api/bridge/invite/kyc
// Decifra el token de invitación y genera el KYC link para el receptor.
// Llama a Bridge ToS + KYC con redirect_uri apuntando de regreso a /recibir?i=TOKEN
//
// Body: { token: string, redirect_uri: string }

import { NextRequest, NextResponse } from "next/server";
import { createTosLink, createKycLink, findCustomerByEmail } from "@/providers/bridge/customers";

export const runtime = "edge";

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

  // ToS link (production only — sandbox skips)
  if (!isSandbox) {
    try {
      const tos = await createTosLink({ full_name, email, type: "individual", redirect_uri });
      return NextResponse.json({ tos_url: tos.url });
    } catch { /* fall through to KYC link */ }
  }

  // KYC link
  try {
    const kyc = await createKycLink({
      full_name,
      email,
      type: "individual",
      endorsements: ["base", "sepa", "spei", "pix", "faster_payments", "cop"],
      redirect_uri,
    });
    const url = (kyc as unknown as Record<string, string>).kyc_link ?? kyc.url ?? null;
    if (!url) throw new Error("No URL in KYC response");
    return NextResponse.json({ kyc_url: url });
  } catch (e) {
    const err = e as Error & { type?: string; details?: Record<string, unknown> };
    if (err.type === "duplicate_record") {
      const existing_link = err.details?.existing_kyc_link as { kyc_link?: string; url?: string } | undefined;
      const url = existing_link?.kyc_link ?? existing_link?.url ?? null;
      if (url) return NextResponse.json({ kyc_url: url });
    }
    return NextResponse.json({ error: err.message ?? "Failed to generate KYC link" }, { status: 500 });
  }
}
