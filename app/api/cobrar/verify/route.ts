import { NextRequest, NextResponse } from "next/server";
import { parseCobrarLink, parseRemesaLink, parseCobrarV2Link, parseRemesaV2Link } from "@/lib/link";

export const runtime = "edge";

// GET /api/cobrar/verify?t=...&s=...&type=cobro|remesa
// Verifica la firma HMAC del link y devuelve el resumen visible al pagador.
// Compatible con tokens v1 (legacy) y v2 (flujo invertido AES-256-GCM).
// NOTA: Para tokens v2 el cadAmount NO se incluye — se calcula en /api/pay/intent con FX en vivo.

function decodeTokenVersion(token: string): number {
  try {
    const b = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + pad), (c) => c.charCodeAt(0))));
    return decoded?.v === 2 ? 2 : 1;
  } catch { return 1; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token  = searchParams.get("t") ?? "";
  const sig    = searchParams.get("s") ?? "";
  const type   = searchParams.get("type") ?? "cobro";
  const secret = process.env.LINK_SECRET ?? "dev-secret";

  if (!token || !sig) {
    return NextResponse.json({ ok: false, error: "Parámetros faltantes" }, { status: 400 });
  }

  const version = decodeTokenVersion(token);

  if (type === "remesa") {
    if (version === 2) {
      const payload = await parseRemesaV2Link(token, sig, secret);
      if (!payload) return NextResponse.json({ ok: false, error: "expired" }, { status: 401 });
      return NextResponse.json({
        ok: true,
        data: {
          type:            "remesa",
          v:               2,
          recipientName:   payload.recipientName,
          receiveAmount:   payload.receiveAmount,
          receiveCurrency: payload.receiveCurrency,
          targetCountry:   payload.targetCountry,
          // cadAmount se calcula en /api/pay/intent con FX en vivo (Regla 1 — nunca estático)
        },
      });
    }

    // v1 legacy
    const payload = await parseRemesaLink(token, sig, secret);
    if (!payload) return NextResponse.json({ ok: false, error: "expired" }, { status: 401 });
    return NextResponse.json({
      ok: true,
      data: {
        type:           "remesa",
        v:              1,
        amount:         payload.amount,
        currency:       payload.currency,
        targetCountry:  payload.targetCountry,
        targetCurrency: payload.targetCurrency,
        targetAmount:   payload.targetAmount,
        name:           payload.senderName ?? payload.senderPhone,
      },
    });
  }

  // ── type=cobro ────────────────────────────────────────────────────────────
  if (version === 2) {
    const payload = await parseCobrarV2Link(token, sig, secret);
    if (!payload) return NextResponse.json({ ok: false, error: "expired" }, { status: 401 });
    return NextResponse.json({
      ok: true,
      data: {
        type:          "cobro",
        v:             2,
        recipientName: payload.recipientName,
        amount:        payload.amount,
        currency:      payload.currency,
      },
    });
  }

  // v1 legacy
  const payload = await parseCobrarLink(token, sig, secret);
  if (!payload) return NextResponse.json({ ok: false, error: "expired" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    data: {
      type:        "cobro",
      v:           1,
      amount:      payload.a,
      currency:    payload.c,
      name:        payload.n,
      checkoutUrl: payload.u,
    },
  });
}
