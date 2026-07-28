// GET /api/test/sim?flow=p2p|b2b&email=...&step=...
// DEV ONLY — simula el flujo completo sin llamar a Bridge ni Stripe.
// En producción devuelve 404.

import { NextRequest, NextResponse } from "next/server";
import { createOrder, updateOrder, getOrder } from "@/lib/order-state";
import { sendEmailNotification }              from "@/lib/notify";
import { buildReceiptURL }                    from "@/lib/link";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const flow   = searchParams.get("flow") ?? "p2p";
  const email  = searchParams.get("email") ?? "";
  const step   = searchParams.get("step") ?? "all";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = process.env.LINK_SECRET ?? "dev-secret";

  // ── P2P simulation ────────────────────────────────────────────────────────
  if (flow === "p2p") {
    const orderId = `OP-TEST-${Date.now()}`;

    if (step === "all" || step === "create") {
      createOrder(orderId, {
        destinationCountry: "MX",
        targetCurrency:     "MXN",
        recipientName:      "María García",
        recipientAccount:   "liq_test_abc123",
        payInProvider:      "bridge-va",
        payOutProvider:     "bridge-liq",
        senderEmail:        email || "test@example.com",
        trackUrl:           `${appUrl}/api/bridge/track?order_id=${orderId}`,
      });

      if (step === "create") {
        return NextResponse.json({
          ok: true, step: "create", order_id: orderId,
          track_url: `${appUrl}/api/bridge/track?order_id=${orderId}`,
          pagar_url: `${appUrl}/pagar?token=DEMO&order_id=${orderId}`,
          message: "Orden creada. Siguiente: /api/test/sim?flow=p2p&step=deposit&order_id=" + orderId,
        });
      }
    }

    const targetId = searchParams.get("order_id") ?? orderId;

    // Step 2: deposit received
    if (step === "deposit") {
      updateOrder(targetId, { status: "LIQUIDATING_FIAT" });
      const order = getOrder(targetId);
      if (order?.senderEmail) {
        await sendEmailNotification(
          order.senderEmail,
          "OmniPay: depósito recibido ✅",
          `<div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#16a34a">¡Depósito confirmado!</h2>
            <p>Recibimos tu depósito y estamos enviando a <strong>${order.recipientName}</strong>.</p>
            <p>Seguimiento: <a href="${order.trackUrl}">${order.trackUrl}</a></p>
          </div>`,
        );
      }
      return NextResponse.json({
        ok: true, step: "deposit", order_id: targetId,
        status: "LIQUIDATING_FIAT",
        email_sent: !!order?.senderEmail,
        message: "Siguiente: /api/test/sim?flow=p2p&step=complete&order_id=" + targetId,
      });
    }

    // Step 3: completed
    if (step === "complete" || step === "all") {
      const id = step === "all" ? orderId : targetId;
      if (step === "all") {
        updateOrder(id, { status: "LIQUIDATING_FIAT" });
      }
      updateOrder(id, { status: "COMPLETED", transferId: "tr_test_xyz" });

      let receiptUrl = `${appUrl}/resultado?order_id=${id}`;
      try {
        receiptUrl = await buildReceiptURL(
          { id, a: 1000, c: "MXN", n: "María García", ts: Date.now(), tt: "remesa" },
          appUrl, secret,
        );
      } catch { /* fallback */ }

      const order = getOrder(id);
      if (order?.senderEmail) {
        await sendEmailNotification(
          order.senderEmail,
          "OmniPay: pago completado ✅",
          `<div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#16a34a">¡Pago completado!</h2>
            <p><strong>${order.recipientName}</strong> ya recibió su dinero.</p>
            <p>Monto recibido: <strong>1,000 MXN</strong></p>
            <p>Comprobante: <a href="${receiptUrl}">${receiptUrl}</a></p>
          </div>`,
        );
      }

      return NextResponse.json({
        ok: true, step: "complete", order_id: id,
        status: "COMPLETED",
        receipt_url: receiptUrl,
        email_sent: !!order?.senderEmail,
        track_url: `${appUrl}/api/bridge/track?order_id=${id}`,
      });
    }

    // Step: failed
    if (step === "fail") {
      updateOrder(targetId, { status: "FAILED", errorMessage: "Fondos insuficientes (simulado)" });
      return NextResponse.json({
        ok: true, step: "fail", order_id: targetId, status: "FAILED",
      });
    }
  }

  // ── B2B simulation ────────────────────────────────────────────────────────
  if (flow === "b2b") {
    const piId = `pi_test_${Date.now()}`;
    const senderEmail = email || "empresa@example.com";

    // Simulate payment_intent.succeeded → stores pending order
    // Simulate payout.paid → would call Wise (skipped in sim)

    function addBusinessDays(d: Date, days: number): Date {
      const date = new Date(d);
      let count = 0;
      while (count < days) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() !== 0 && date.getDay() !== 6) count++;
      }
      return date;
    }

    const eta = addBusinessDays(new Date(), 5);
    const etaStr = eta.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    if (senderEmail) {
      await sendEmailNotification(
        senderEmail,
        "OmniPay: pago B2B confirmado ✅",
        `<div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#16a34a">Pago confirmado</h2>
          <p>Stripe procesó tu pago. Wise ejecutará la transferencia en los próximos 4–5 días hábiles.</p>
          <p>📅 Fecha estimada de entrega: <strong>${etaStr}</strong></p>
          <p>PI: <code>${piId}</code></p>
        </div>`,
      );
    }

    return NextResponse.json({
      ok: true, flow: "b2b",
      payment_intent_id: piId,
      status: "confirmed",
      eta: eta.toISOString().split("T")[0],
      eta_label: etaStr,
      email_sent: !!senderEmail,
      wise_note: "Wise transfer skipped in simulation (no credentials)",
    });
  }

  return NextResponse.json({ error: "flow must be p2p or b2b" }, { status: 400 });
}
