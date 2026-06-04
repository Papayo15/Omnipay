import { NextRequest, NextResponse } from "next/server";
import { verifyReceiptToken } from "@/lib/link";

export const runtime = "edge";

// GET /api/receipt/verify?r=dataB64.sigB64
// Verifica la firma HMAC del comprobante server-side.
// Previene falsificación: un comprobante alterado tiene firma inválida.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token  = searchParams.get("r") ?? "";
  const secret = process.env.LINK_SECRET ?? "dev-secret";

  if (!token) {
    return NextResponse.json({ ok: false, error: "Token faltante" }, { status: 400 });
  }

  const data = await verifyReceiptToken(token, secret);
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Comprobante inválido o falsificado" },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
