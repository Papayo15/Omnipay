import { NextRequest, NextResponse } from "next/server";
import { encryptPayload } from "@/lib/accountcrypto";
import { buildRemesaV2Link } from "@/lib/link";

// POST /api/remesa/request
// El RECEPTOR (en México) genera el link que envía al EMISOR (en Canadá u otro país).
//
// REGLA 1 — FX en vivo: el token NO guarda el cadAmount. Solo guarda el monto en MXN.
// El cálculo exacto en CAD ocurre en /api/pay/intent con la tasa Wise del momento del pago.
//
// REGLA 2 — Wise via webhook: la transferencia Wise la dispara el evento
// stripe `payment_intent.succeeded` (servidor→servidor), no un POST manual del cliente.
//
// REGLA 3 — Ciphertext unificado: cuenta bancaria + teléfonos en un solo AES-256-GCM string.
// El webhook lo desencripta para ejecutar Wise y enviar notificaciones SMS/WhatsApp.

interface RemesaRequestBody {
  recipientName: string;     // nombre del receptor
  recipientAccount: string;  // CLABE/IBAN → bank | 16 dígitos → card | teléfono → wallet
  receiveMode?: "bank" | "card" | "wallet"; // rail de dispersión (default: "bank" → Wise)
  receiveAmount: number;     // monto que quiere recibir (e.g., 1000)
  receiveCurrency: string;   // moneda del receptor (e.g., "MXN")
  targetCountry: string;     // código ISO del país receptor — para enrutamiento Wise/Paysend/Thunes
  originCountry: string;     // país del emisor — solo para calcular el quote de preview
  recipientPhone?: string;   // E.164 — para notificación cuando llega el dinero
  senderPhone?: string;      // E.164 — para notificación cuando se confirma el envío
}

// Mapa país → moneda para el quote de preview en la moneda del emisor
const COUNTRY_CURRENCY: Record<string, string> = {
  CA: "CAD", US: "USD", MX: "MXN", GB: "GBP",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR",
  AU: "AUD", JP: "JPY", CN: "CNY", IN: "INR", BR: "BRL",
  CO: "COP", PE: "PEN", CL: "CLP", AR: "ARS", NG: "NGN", KE: "KES",
};

// FX server-side sin cache — el quote es orientativo para el mensaje de WhatsApp
async function fetchRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json() as { rates: Record<string, number> };
    return data.rates[to] ?? null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body: RemesaRequestBody = await req.json();
    const {
      recipientName, recipientAccount,
      receiveMode,
      receiveAmount, receiveCurrency, targetCountry,
      originCountry, recipientPhone, senderPhone,
    } = body;

    if (!recipientName?.trim() || !recipientAccount?.trim()
        || !receiveAmount || !receiveCurrency || !targetCountry) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    if (receiveAmount <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }

    const secret = process.env.LINK_SECRET ?? "dev-secret";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Quote estimado para el mensaje de WhatsApp — orientativo, NO vinculante.
    // El monto exacto en CAD se recalcularà con FX en vivo en /api/pay/intent (Regla 1).
    const originCurrency = COUNTRY_CURRENCY[originCountry.toUpperCase()] ?? "CAD";
    let estimatedOriginAmount: number | null = null;

    const cadToReceive = await fetchRate("CAD", receiveCurrency.toUpperCase());
    if (cadToReceive && cadToReceive > 0) {
      const cadNeeded = receiveAmount / cadToReceive / 0.99; // descontar 1% fee OmniPay
      if (originCurrency === "CAD") {
        estimatedOriginAmount = parseFloat(cadNeeded.toFixed(2));
      } else {
        const originToCAD = await fetchRate(originCurrency, "CAD");
        if (originToCAD && originToCAD > 0) {
          estimatedOriginAmount = parseFloat((cadNeeded / originToCAD).toFixed(2));
        }
      }
    }

    // Un solo ciphertext AES-256-GCM con cuenta + modo + teléfonos (Regla 3).
    // El webhook lo desencripta → lee receiveMode → enruta a Wise / Paysend / Thunes.
    const encryptedPayload = await encryptPayload({
      account:        recipientAccount.trim(),
      receiveMode:    receiveMode ?? "bank",
      recipientPhone: recipientPhone?.trim(),
      senderPhone:    senderPhone?.trim(),
    });

    // Token solo guarda monto en MXN — sin cadAmount (Regla 1).
    const shareLink = await buildRemesaV2Link(
      {
        v:               2,
        recipientName:   recipientName.trim(),
        encryptedPayload,
        receiveAmount,
        receiveCurrency: receiveCurrency.toUpperCase(),
        targetCountry:   targetCountry.toUpperCase(),
      },
      appUrl,
      secret,
    );

    return NextResponse.json({
      share_link: shareLink,
      // Solo para el mensaje de WhatsApp — el pagador verá el monto exacto al abrir el link.
      quote: estimatedOriginAmount !== null
        ? {
            receiveAmount,
            receiveCurrency:       receiveCurrency.toUpperCase(),
            estimatedOriginAmount,
            originCurrency,
          }
        : null,
    });
  } catch (err) {
    console.error("remesa/request error:", err);
    return NextResponse.json({ error: "Error generando el link" }, { status: 500 });
  }
}
