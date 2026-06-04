import { NextRequest, NextResponse } from "next/server";
import { parseCobrarLink } from "@/lib/link";

export const runtime = "edge";

// GET /api/cobrar/verify?t=...&s=...
// Verifica la firma del link de cobro antes de mostrárselo al cliente.
// Si el link es válido devuelve los datos del pago para mostrar en /pagar.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t") ?? "";
  const sig   = searchParams.get("s") ?? "";

  if (!token || !sig) {
    return NextResponse.json({ ok: false, error: "Missing parameters" }, { status: 400 });
  }

  const payload = await parseCobrarLink(token, sig, process.env.LINK_SECRET ?? "dev-secret");

  if (!payload) {
    return NextResponse.json({ ok: false, error: "Link inválido o expirado (5 min)" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      a: payload.a,
      c: payload.c,
      n: payload.n,
      u: payload.u,  // Stripe Checkout URL
    },
  });
}
