import { NextRequest, NextResponse } from "next/server";
import { encryptPayload } from "@/lib/accountcrypto";
import { buildCobrarV2Link } from "@/lib/link";

// POST /api/cobrar/request
// El COMERCIANTE (receptor del pago) genera el link de cobro.
// No requiere cuenta Stripe — el pagador paga embebido con Stripe Payment Element.
// La dispersión Wise ocurre en el webhook stripe (payment_intent.succeeded), no aquí.

interface CobrarRequestBody {
  recipientName: string;     // nombre del comerciante
  recipientAccount: string;  // CLABE, IBAN, routing, etc. del comerciante
  amount: number;            // monto a cobrar en moneda local
  currency: string;          // "MXN" para México — Stripe cobra nativamente en MXN
  recipientPhone?: string;   // para SMS/WhatsApp de confirmación al comerciante
  payerPhone?: string;       // opcional — para notificar al pagador también
}

export async function POST(req: NextRequest) {
  try {
    const body: CobrarRequestBody = await req.json();
    const { recipientName, recipientAccount, amount, currency, recipientPhone, payerPhone } = body;

    if (!recipientName?.trim() || !recipientAccount?.trim() || !amount || !currency) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    if (amount <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }

    const secret = process.env.LINK_SECRET ?? "dev-secret";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // La cuenta bancaria y teléfonos se encriptan en AES-256-GCM.
    // Solo el servidor puede desencriptarlos. El webhook de Stripe los usa para disparar Wise.
    const encryptedPayload = await encryptPayload({
      account:        recipientAccount.trim(),
      recipientPhone: recipientPhone?.trim(),
      senderPhone:    payerPhone?.trim(),
    });

    const shareLink = await buildCobrarV2Link(
      {
        v:                2,
        recipientName:    recipientName.trim(),
        encryptedPayload,
        amount,
        currency:         currency.toUpperCase(),
      },
      appUrl,
      secret,
    );

    return NextResponse.json({ share_link: shareLink });
  } catch (err) {
    console.error("cobrar/request error:", err);
    return NextResponse.json({ error: "Error generando el link" }, { status: 500 });
  }
}
