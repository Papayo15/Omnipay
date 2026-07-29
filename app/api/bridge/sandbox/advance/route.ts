// GET /api/bridge/sandbox/advance?order_id=OP-XXX
//
// Sandbox-only: manually simulates the Bridge webhook flow so orders can reach COMPLETED
// in testing without waiting for real webhooks (Bridge does not send webhooks in sandbox).
//
// Sequence:
//   1. PENDING_PAYIN → LIQUIDATING_FIAT  (simulates virtual_account.deposit_received)
//   2. 500ms pause
//   3. LIQUIDATING_FIAT → COMPLETED      (simulates liquidation_address.drain_completed)
//   4. Triggers handleCompletion (sends emails, WhatsApp alert, receipt URL)
//
// Rejected in production — returns 403.

import { NextRequest, NextResponse } from "next/server";
import { updateOrder, getOrder }     from "@/lib/order-state";
import { handleCompletion }          from "@/app/api/bridge/webhook/route";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  if (!isSandbox) {
    return NextResponse.json({ error: "This endpoint is sandbox-only." }, { status: 403 });
  }

  const orderId = req.nextUrl.searchParams.get("order_id");
  if (!orderId || !orderId.startsWith("OP-")) {
    return NextResponse.json({ error: "order_id is required and must start with OP-" }, { status: 400 });
  }

  const order = getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: `Order ${orderId} not found.` }, { status: 404 });
  }

  // Step 1 — simulate deposit received
  updateOrder(orderId, { status: "LIQUIDATING_FIAT" });

  // Step 2 — brief pause
  await new Promise((r) => setTimeout(r, 500));

  // Step 3 — simulate drain completed
  updateOrder(orderId, { status: "COMPLETED", completedAt: Date.now() });

  // Step 4 — trigger completion flow (emails + admin alert + receipt)
  await handleCompletion(orderId, {
    amount:   order.amount ?? order.usdcGross ?? 0,
    currency: "USD",
    receipt:  {
      destination_amount:   String(order.amount ?? order.usdcGross ?? 0),
      destination_currency: order.targetCurrency ?? "USD",
    },
  });

  return NextResponse.json({
    ok:       true,
    order_id: orderId,
    status:   "COMPLETED",
    message:  "Sandbox: order advanced to COMPLETED and completion emails sent.",
  });
}
