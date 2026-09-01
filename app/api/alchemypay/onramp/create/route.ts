// POST /api/alchemypay/onramp/create
//
// Alternative pay-in for senders whose country has no native rail on Bridge
// (no Virtual Account support). The order must already exist — created the
// normal way via /api/bridge/checkout (or /api/bridge/b2b/checkout), which
// returns the recipient's Bridge liquidation address — and this route just
// swaps the pay-in leg to Alchemy Pay's on-ramp, targeting that same address.
//
// Bridge's own webhook (virtual_account.deposit_received /
// liquidation_address.drain_completed) still owns the on-chain confirmation and
// the LIQUIDATING_FIAT transition — this route only records that the pay-in for
// this order is going through Alchemy Pay, and Alchemy Pay's webhook
// (/api/alchemypay/webhook) gives an earlier PROCESSING_ONCHAIN signal once the
// sender's fiat payment clears.

import { NextRequest, NextResponse } from "next/server";
import { createOnRampOrder } from "@/providers/alchemypay/onramp";
import { getOrderAsync, updateOrder } from "@/lib/order-state";

export const runtime = "nodejs";

interface CreateBody {
  orderId:      string;   // existing OmniPay order (from /api/bridge/checkout)
  address:      string;   // recipient's Bridge liquidation address (on-chain, Polygon)
  fiatAmount:   number;
  fiatCurrency: string;
  country:      string;   // sender's country — ISO 3166-1 alpha-2
  email?:       string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: CreateBody = await req.json();
    if (!body.orderId || !body.address || !body.fiatAmount || !body.fiatCurrency || !body.country) {
      return NextResponse.json({ error: "orderId, address, fiatAmount, fiatCurrency and country are required" }, { status: 400 });
    }

    const order = await getOrderAsync(body.orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const onRampOrder = await createOnRampOrder({
      merchantOrderNo: body.orderId,
      fiatAmount:      body.fiatAmount,
      fiatCurrency:    body.fiatCurrency,
      country:         body.country,
      crypto:          "USDC",
      network:         "MATIC",
      address:         body.address,
      email:           body.email,
      redirectUrl:     `${appUrl}/pagar?order_id=${body.orderId}&ap_onramp_done=1`,
    });

    updateOrder(body.orderId, { payInProvider: "alchemypay" });

    return NextResponse.json({
      order_id:    body.orderId,
      pay_link:    onRampOrder.payLink,
      alchemy_pay_order_no: onRampOrder.orderNo,
    });
  } catch (err) {
    console.error("[alchemypay/onramp/create] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "On-ramp order error" },
      { status: 500 },
    );
  }
}
