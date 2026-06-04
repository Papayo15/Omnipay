import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";

export const runtime = "edge";

// POST /api/remesa/tokenize
// Recibe el número de tarjeta del emisor server-side, lo tokeniza con Airwallex,
// y devuelve el token cifrado con AES-256 (el PAN nunca se almacena ni se reenvía).
// El token cifrado viaja dentro del RemesaPayload firmado — solo OmniPay puede descifrarlo.

export async function POST(req: NextRequest) {
  try {
    const { cardNumber } = await req.json() as { cardNumber?: string };
    const digits = (cardNumber ?? "").replace(/\D/g, "");

    if (digits.length !== 16) {
      return NextResponse.json({ error: "Se requieren 16 dígitos de tarjeta" }, { status: 400 });
    }

    const clientId = process.env.AIRWALLEX_CLIENT_ID ?? "";
    const apiKey   = process.env.AIRWALLEX_API_KEY   ?? "";
    const secret   = process.env.LINK_SECRET ?? "dev-secret";

    // ── Entorno de producción: tokenizar con Airwallex ──────────────
    if (clientId && apiKey) {
      // 1. Obtener token de autenticación Airwallex
      const authRes = await fetch("https://api.airwallex.com/api/v1/authentication/login", {
        method: "POST",
        headers: {
          "x-client-id": clientId,
          "x-api-key":   apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!authRes.ok) throw new Error("Airwallex auth failed");
      const { token: awToken } = await authRes.json() as { token: string };

      // 2. Crear customer consent (pago off-session del emisor)
      const consentRes = await fetch("https://api.airwallex.com/api/v1/pa/payment_consent/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${awToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id:         crypto.randomUUID(),
          currency:           "CAD", // se actualizará al ejecutar con la moneda real
          customer_id:        `omnipay_${crypto.randomUUID().slice(0, 8)}`,
          merchant_trigger_reason: "scheduled",
          next_triggered_by: "merchant",
          payment_method_options: {
            card: {
              card_number: digits,
            },
          },
        }),
      });
      if (!consentRes.ok) throw new Error("Airwallex tokenization failed");
      const consent = await consentRes.json() as { id: string; payment_method?: { id: string } };
      const awCardToken = consent.payment_method?.id ?? consent.id;

      // Cifrar el token Airwallex con AES-256 antes de enviarlo al cliente
      const encrypted = await encrypt(new TextEncoder().encode(awCardToken), secret);
      return NextResponse.json({ token: encrypted });
    }

    // ── Entorno de desarrollo / sandbox: token simulado ─────────────
    // En producción siempre usar Airwallex. Aquí solo para testing local.
    const mockToken = `aw_tok_${digits.slice(-4)}_${Date.now()}`;
    const encrypted = await encrypt(new TextEncoder().encode(mockToken), secret);
    return NextResponse.json({ token: encrypted });

  } catch (err) {
    console.error("Tokenize error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al tokenizar tarjeta" },
      { status: 500 }
    );
  }
}
