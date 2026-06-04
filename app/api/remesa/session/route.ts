import { NextRequest, NextResponse } from "next/server";
import { buildRemesaLink } from "@/lib/link";

export const runtime = "edge";

// POST /api/remesa/session
// Construye el RemesaPayload firmado que el emisor compartirá con el receptor.
// El senderCardToken (ya cifrado con AES-256) viaja dentro del link firmado HMAC.

interface RemesaSessionRequest {
  amount: number;
  currency: string;
  targetCountry: string;
  targetCurrency: string;
  targetAmount: number;
  senderPhone: string;
  senderName?: string;
  recipientPhone: string;
  recipientName?: string;
  senderCardToken: string; // token Airwallex ya cifrado con AES-256
}

export async function POST(req: NextRequest) {
  try {
    const data: RemesaSessionRequest = await req.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const secret = process.env.LINK_SECRET ?? "dev-secret";

    if (!data.amount || data.amount <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }
    if (!data.senderCardToken) {
      return NextResponse.json({ error: "Token de tarjeta requerido" }, { status: 400 });
    }
    if (!data.recipientPhone && !data.recipientName) {
      return NextResponse.json({ error: "Datos del receptor requeridos" }, { status: 400 });
    }

    const shareLink = await buildRemesaLink(
      {
        amount:          data.amount,
        currency:        data.currency,
        targetCountry:   data.targetCountry,
        targetCurrency:  data.targetCurrency,
        targetAmount:    data.targetAmount,
        senderPhone:     data.senderPhone,
        senderName:      data.senderName,
        recipientPhone:  data.recipientPhone,
        recipientName:   data.recipientName,
        senderCardToken: data.senderCardToken,
      },
      appUrl,
      secret
    );

    return NextResponse.json({ share_link: shareLink });
  } catch (err) {
    console.error("Remesa session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar link" },
      { status: 500 }
    );
  }
}
