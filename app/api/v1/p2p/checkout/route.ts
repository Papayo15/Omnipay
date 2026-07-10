import { NextRequest, NextResponse } from "next/server";
import { getBitsoUSDCRate, calcP2PFee } from "@/lib/bitso";

// POST /api/v1/p2p/checkout
//
// Genera un token AES-256-GCM con { clabe, nombre, amount_mxn }
// y retorna la configuración para el widget de Ramp/Transak.
//
// El token viaja como partnerOrderId en el widget — sin base de datos.
// Stateless puro: el webhook lo desencripta para saber a dónde enviar.

async function encryptP2PToken(payload: object, secret: string): Promise<string> {
  const enc        = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret.slice(0, 32).padEnd(32, "0")),
    "AES-GCM", false, ["encrypt"],
  );
  const iv         = crypto.getRandomValues(new Uint8Array(12));
  const data       = enc.encode(JSON.stringify(payload));
  const encrypted  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keyMaterial, data);
  const combined   = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return Buffer.from(combined).toString("base64url");
}

export async function POST(req: NextRequest) {
  const apiKey    = process.env.BITSO_API_KEY;
  const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
  const bitsoAddr = process.env.OMNIPAY_BITSO_USDC_ADDRESS;

  // Sin credenciales → 503 (plug-and-play: activa cuando lleguen las vars)
  if (!apiKey || !bitsoAddr) {
    return NextResponse.json(
      { error: "P2P service not yet configured. Awaiting Bitso + Ramp credentials." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json() as { nombre?: string; clabe?: string; amount_mxn?: number };
    const { nombre, clabe, amount_mxn } = body;

    if (!nombre || !clabe || !amount_mxn) {
      return NextResponse.json({ error: "nombre, clabe y amount_mxn son requeridos" }, { status: 400 });
    }
    if (!/^\d{18}$/.test(clabe)) {
      return NextResponse.json({ error: "CLABE debe tener exactamente 18 dígitos" }, { status: 400 });
    }
    if (amount_mxn < 100) {
      return NextResponse.json({ error: "Monto mínimo: 100 MXN" }, { status: 400 });
    }

    // Cotización en vivo
    const rateMxnPerUsdc = await getBitsoUSDCRate();
    const usdcNeeded     = amount_mxn / rateMxnPerUsdc;
    const feeUsdc        = calcP2PFee(usdcNeeded);
    const usdcTotal      = parseFloat((usdcNeeded + feeUsdc).toFixed(6));

    // Token cifrado — sin TTL de cotización (solo cifra destino)
    const partnerOrderId = await encryptP2PToken(
      { clabe, nombre, amount_mxn, created_at: Date.now() },
      linkSecret,
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    return NextResponse.json({
      partnerOrderId,
      widget: {
        // Configuración para Ramp Network o Transak
        // El pagador ve: usdcTotal USD → widget convierte → USDC llega a bitsoAddr
        swapAmount:            usdcTotal.toString(),
        swapAsset:             "USDC_POLYGON",
        userAddress:           bitsoAddr,
        partnerOrderId,
        finalUrl:              `${appUrl}/p2p/confirm?ref=${partnerOrderId.slice(0, 12)}`,
      },
      estimate: {
        recipient_gets_mxn:   amount_mxn,
        usdc_total:           usdcTotal,
        omnipay_fee_usdc:     parseFloat(feeUsdc.toFixed(2)),
        rate_mxn_per_usdc:    parseFloat(rateMxnPerUsdc.toFixed(4)),
      },
    });
  } catch (err) {
    console.error("[p2p/checkout] error:", err);
    return NextResponse.json({ error: "Error al generar el checkout" }, { status: 500 });
  }
}
