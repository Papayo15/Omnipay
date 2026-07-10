import { NextRequest, NextResponse } from "next/server";
import { executeBitsoSPEI, calcP2PFee } from "@/lib/bitso";
import { sendAdminWhatsApp } from "@/lib/notify";

// POST /api/v1/p2p/webhook
//
// Recibe confirmación de Ramp Network o Transak cuando el USDC llegó a Bitso.
// Desencripta el partnerOrderId → obtiene { clabe, nombre, amount_mxn }
// Calcula fee OmniPay → ejecuta SPEI con USDC neto vía Bitso Business API.
//
// Idempotente: si el mismo partnerOrderId ya fue procesado (mismo wid en Bitso),
// Bitso lo rechaza con error duplicado → retornamos 200 de todas formas.
//
// Activación: requiere BITSO_API_KEY + BITSO_API_SECRET + RAMP_WEBHOOK_SECRET

async function decryptP2PToken(token: string, secret: string): Promise<{ clabe: string; nombre: string; amount_mxn: number; created_at: number } | null> {
  try {
    const enc         = new TextEncoder();
    const combined    = Buffer.from(token, "base64url");
    const iv          = combined.subarray(0, 12);
    const ciphertext  = combined.subarray(12);
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(secret.slice(0, 32).padEnd(32, "0")),
      "AES-GCM", false, ["decrypt"],
    );
    const decrypted   = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch { return null; }
}

async function verifyRampSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!secret) return true; // sin secret configurado → aceptar en dev
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    // Ramp envía la firma como "sha256=<hex>" o solo el hex según la versión del SDK
    const incoming = sigHeader.replace(/^sha256=/, "");
    if (computed.length !== incoming.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ incoming.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const bitsoKey    = process.env.BITSO_API_KEY;
  const bitsoSecret = process.env.BITSO_API_SECRET;
  const rampSecret  = process.env.RAMP_WEBHOOK_SECRET ?? "";
  const linkSecret  = process.env.LINK_SECRET ?? "dev-secret";

  if (!bitsoKey || !bitsoSecret) {
    console.warn("[p2p/webhook] Sin credenciales Bitso — ignorando evento");
    return NextResponse.json({ received: true });
  }

  const rawBody  = await req.text();
  const sigHeader = req.headers.get("x-body-signature") ?? req.headers.get("x-ramp-signature") ?? "";

  const valid = await verifyRampSignature(rawBody, sigHeader, rampSecret);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Ramp envía status COMPLETED cuando el USDC llegó a la dirección destino
  const status         = String(event.status ?? event.type ?? "");
  const partnerOrderId = String(event.partnerOrderId ?? event.partner_order_id ?? "");
  const usdcAmount     = parseFloat(String(event.cryptoAmount ?? event.crypto_amount ?? event.amount ?? "0"));

  if (!status.toUpperCase().includes("COMPLETE") && !status.toUpperCase().includes("SUCCESS")) {
    // Evento informativo (pending, processing) → acusar recibo sin acción
    return NextResponse.json({ received: true, action: "none", status });
  }

  if (!partnerOrderId || !usdcAmount) {
    console.error("[p2p/webhook] Falta partnerOrderId o usdcAmount", event);
    return NextResponse.json({ received: true });
  }

  // Desencriptar destino
  const payload = await decryptP2PToken(partnerOrderId, linkSecret);
  if (!payload) {
    console.error("[p2p/webhook] No se pudo desencriptar partnerOrderId");
    return NextResponse.json({ received: true }); // 200 para no causar reintentos infinitos
  }

  const { clabe, nombre, amount_mxn } = payload;

  // Calcular fee y USDC neto
  const feeUsdc  = calcP2PFee(usdcAmount);
  const usdcNeto = parseFloat((usdcAmount - feeUsdc).toFixed(6));

  if (usdcNeto <= 0) {
    console.error(`[p2p/webhook] USDC neto negativo (${usdcNeto}) para TX ${partnerOrderId}`);
    return NextResponse.json({ received: true });
  }

  try {
    const widId = await executeBitsoSPEI(
      bitsoKey,
      bitsoSecret,
      clabe,
      nombre,
      usdcNeto,
      partnerOrderId.slice(0, 20), // referencia para Bitso
    );

    // Alerta admin vía WhatsApp
    sendAdminWhatsApp(
      `✅ OmniPay P2P\n${nombre} recibirá ~$${amount_mxn.toLocaleString()} MXN\nUSDC enviados: ${usdcNeto}\nFee OmniPay: $${feeUsdc.toFixed(2)} USD\nBitso WID: ${widId}`
    ).catch(() => {});

    console.log(`[p2p/webhook] SPEI ejecutado → Bitso WID ${widId} → CLABE ${clabe.slice(0, 6)}...`);
    return NextResponse.json({ received: true, widId, clabe_prefix: clabe.slice(0, 6) });

  } catch (err) {
    const e = err as Error & { code?: string };
    console.error("[p2p/webhook] Bitso SPEI error:", e.message, e.code);

    // CLABE inválida → 200 (no reintentar, no hay nada que hacer)
    if (e.code === "INVALID_CLABE") {
      sendAdminWhatsApp(
        `❌ OmniPay P2P — CLABE inválida\n${nombre}\nCLABE: ${clabe}\nMXN perdidos: $${amount_mxn}`
      ).catch(() => {});
      return NextResponse.json({ received: true, error: "CLABE inválida — revisar urgente" });
    }

    // Error transitorio (balance Bitso bajo, red) → 503 → Ramp reintenta
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
