// POST /api/bitso/webhook
//
// Recibe notificaciones de depósito de Bitso Multi-CLABE.
// Cuando llega MXN a una CLABE de OmniPay:
//   1. Verifica el secreto del webhook
//   2. Encuentra la orden por el mapeo clabe→orderId en Redis
//   3. Si destino = MX → SPEI directo via Bitso (automático)
//   4. Si destino = extranjero → notifica admin; conversión MXN→USDC→Bridge (pendiente)
//   5. Envía emails y WhatsApp de confirmación
//
// Env vars requeridas:
//   BITSO_WEBHOOK_SECRET — para verificar autenticidad del webhook

import { NextRequest, NextResponse }            from "next/server";
import { createHmac }                            from "crypto";
import { getRedis }                              from "@/lib/redis";
import { getOrderAsync, updateOrder }            from "@/lib/order-state";
import { createWithdrawal }                      from "@/providers/bitso/withdrawals";
import { sendAdminWhatsApp }                     from "@/lib/notify";
import { handleCompletion }                      from "@/app/api/bridge/webhook/route";

export const runtime = "nodejs";

interface BitsoDepositEvent {
  type:    "deposit" | "multi_clabe_deposit";
  payload: {
    did?:         string;     // deposit ID
    clabe:        string;
    amount:       string;     // MXN string
    currency:     string;
    status:       "pending" | "complete" | "failed";
    clave_de_rastreo?: string;
    sender_name?: string;
  };
}

function verifySignature(rawBody: string, sigHeader: string | null): boolean {
  const secret = process.env.BITSO_WEBHOOK_SECRET ?? "";
  if (!secret || !sigHeader) return !secret; // allow through if secret not configured (dev only)
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sigHeader === expected || sigHeader === `sha256=${expected}`;
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody   = await req.text();
  const sigHeader = req.headers.get("x-bitso-signature") ?? req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, sigHeader)) {
    console.warn("[bitso/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: BitsoDepositEvent;
  try { event = JSON.parse(rawBody) as BitsoDepositEvent; }
  catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { type, payload } = event;
  if (type !== "deposit" && type !== "multi_clabe_deposit") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { clabe, amount, status, clave_de_rastreo, sender_name } = payload;
  console.log(`[bitso/webhook] deposit clabe=${clabe} amount=${amount} status=${status}`);

  if (status !== "complete") {
    return NextResponse.json({ ok: true, status: "waiting_for_complete" });
  }

  // 1. Buscar orderId por clabe
  let orderId: string | null = null;
  try {
    const redis = await getRedis();
    orderId = await redis.get(`clabe-${clabe}`);
  } catch (e) {
    console.error("[bitso/webhook] Redis get error:", (e as Error).message);
  }

  if (!orderId) {
    console.warn(`[bitso/webhook] No order found for clabe=${clabe}`);
    await sendAdminWhatsApp(
      `⚠️ OmniPay Bitso — depósito sin orden\nCLABE: ${clabe}\nMonto: MXN $${amount}\nEmisor: ${sender_name ?? "?"}`
    );
    return NextResponse.json({ ok: true, note: "deposit received but no order matched" });
  }

  // 2. Obtener orden
  const order = await getOrderAsync(orderId);
  if (!order) {
    console.warn(`[bitso/webhook] Order ${orderId} not found in state`);
    return NextResponse.json({ ok: true, note: "order not found" });
  }

  updateOrder(orderId, { status: "LIQUIDATING_FIAT" });

  // 3. Recuperar metadata del receptor almacenada en transferId temporalmente
  let meta: Record<string, string> = {};
  try { meta = JSON.parse(order.transferId ?? "{}") as Record<string, string>; } catch { /* */ }

  const destCountry = order.destinationCountry;

  try {
    if (destCountry === "MX") {
      // ── Payout directo SPEI via Bitso ──────────────────────────────────────
      const withdrawal = await createWithdrawal({
        amount:      amount,
        beneficiary: order.recipientName,
        clabe:       order.recipientAccount,
        origin_id:   orderId.replace(/-/g, "").slice(0, 40),
        notes_ref:   `OmniPay ${orderId}`.slice(0, 40),
      });

      updateOrder(orderId, {
        status:     withdrawal.status === "complete" ? "COMPLETED" : "PROCESSING_ONCHAIN",
        transferId: withdrawal.wid,
      });

      if (withdrawal.status === "complete") {
        await handleCompletion(orderId, {
          amount:   parseFloat(amount),
          currency: "MXN",
          receipt:  { destination_amount: amount, destination_currency: "MXN" },
        });
      } else {
        await sendAdminWhatsApp(
          `⏳ OmniPay Bitso SPEI — procesando\nOrden: ${orderId}\nReceptor: ${order.recipientName}\nMonto: MXN $${amount}\nWID: ${withdrawal.wid}`,
        );
      }
    } else {
      // ── Destino extranjero — notificar admin; conversión MXN→Bridge pendiente ──
      // TODO Fase 3: llamar Bitso trading API (MXN→USDC) → Bridge executeTransfer
      // Por ahora: admin recibe alerta y procesa manualmente la conversión.
      updateOrder(orderId, { status: "PROCESSING_ONCHAIN" });

      await sendAdminWhatsApp(
        `💱 OmniPay Bitso — depósito MXN recibido\n` +
        `Orden: ${orderId}\n` +
        `Receptor: ${order.recipientName} (${destCountry})\n` +
        `Cuenta: ${order.recipientAccount}\n` +
        `Monto MXN: $${amount}\n` +
        `Rastreo: ${clave_de_rastreo ?? "?"}\n` +
        `⚠️ Requiere conversión MXN→${order.targetCurrency} manual via Bitso→Bridge`,
      );
    }
  } catch (payoutErr) {
    const e = payoutErr as Error;
    console.error("[bitso/webhook] payout error:", e.message);
    updateOrder(orderId, { status: "FAILED", errorMessage: e.message });
    await sendAdminWhatsApp(
      `❌ OmniPay Bitso — ERROR en payout\nOrden: ${orderId}\nError: ${e.message}`,
    );
  }

  return NextResponse.json({ ok: true });
}
