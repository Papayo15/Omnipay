import { NextRequest, NextResponse } from "next/server";
import { parseCobrarLink, parseRemesaLink } from "@/lib/link";

export const runtime = "edge";

// GET /api/cobrar/verify?t=...&s=...&type=cobro|remesa
// Verifica la firma HMAC del link antes de mostrarlo al receptor.
// Devuelve los datos del pago para que /pagar se adapte (camaleón).

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t") ?? "";
  const sig   = searchParams.get("s") ?? "";
  const type  = searchParams.get("type") ?? "cobro";
  const secret = process.env.LINK_SECRET ?? "dev-secret";

  if (!token || !sig) {
    return NextResponse.json({ ok: false, error: "Parámetros faltantes" }, { status: 400 });
  }

  if (type === "remesa") {
    const payload = await parseRemesaLink(token, sig, secret);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "expired" }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      data: {
        type:           "remesa",
        amount:         payload.amount,
        currency:       payload.currency,
        targetCountry:  payload.targetCountry,
        targetCurrency: payload.targetCurrency,
        targetAmount:   payload.targetAmount,
        name:           payload.senderName ?? payload.senderPhone,
      },
    });
  }

  // type=cobro (default)
  const payload = await parseCobrarLink(token, sig, secret);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    data: {
      type:        "cobro",
      amount:      payload.a,
      currency:    payload.c,
      name:        payload.n,
      checkoutUrl: payload.u,
    },
  });
}
