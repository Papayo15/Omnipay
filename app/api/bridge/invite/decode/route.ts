// GET /api/bridge/invite/decode?i=TOKEN
// Decifra un token de invitación (AES-256-GCM) y retorna los metadatos del receptor.
// Zero PII: no escribe nada en base de datos.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const IV_BYTES = 12;

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET not set");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":invite"));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

function fromBase64url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - b.length % 4);
  return Uint8Array.from(atob(b + pad), c => c.charCodeAt(0));
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get("i");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const key = await importKey();
    const packed = fromBase64url(token);
    const iv = packed.slice(0, IV_BYTES);
    const ciphertext = packed.slice(IV_BYTES);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const payload = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;

    // Only return what the UI needs — strip bank details (PII)
    return NextResponse.json({
      recipient_name:    payload.recipient_name,
      recipient_email:   payload.recipient_email,
      recipient_country: payload.recipient_country,
      sender_name:       payload.sender_name,
      amount_target:     payload.amount_target,
      exp:               payload.exp,
    });
  } catch {
    return NextResponse.json({ error: "Invalid or tampered token" }, { status: 400 });
  }
}
