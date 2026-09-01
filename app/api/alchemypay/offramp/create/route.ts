// POST /api/alchemypay/offramp/create
//
// Used when the recipient's country has no native payout rail on Bridge. The
// USDC has already landed in Bridge's custody (via the normal Virtual Account /
// liquidation-address pay-in); this route hands it off to Alchemy Pay's
// off-ramp for the local bank payout.
//
// Order matters (see providers/alchemypay/offramp.ts): the off-ramp order is
// created FIRST to get Alchemy Pay's deposit address, THEN the USDC is moved
// on-chain via Bridge — never the other way around.

import { NextRequest, NextResponse } from "next/server";
import { alchemypayProvider } from "@/providers/pay-out/alchemypay";
import { getOrderAsync, updateOrder } from "@/lib/order-state";

export const runtime = "nodejs";

interface CreateBody {
  orderId:          string;
  recipientName:    string;
  recipientAccount: string;   // bank account number / IBAN / PayID depending on country
  targetCountry:    string;
  targetCurrency:   string;
  usdcNetAmount:    number;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: CreateBody = await req.json();
    if (!body.orderId || !body.recipientName || !body.recipientAccount
        || !body.targetCountry || !body.targetCurrency || !body.usdcNetAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const order = await getOrderAsync(body.orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const result = await alchemypayProvider.executeTransfer({
      orderId:          body.orderId,
      recipientName:    body.recipientName,
      recipientAccount: body.recipientAccount,
      accountType:      "bank",
      targetCountry:    body.targetCountry,
      targetCurrency:   body.targetCurrency,
      usdcNetAmount:    body.usdcNetAmount,
      reference:        body.orderId,
    });

    updateOrder(body.orderId, {
      payOutProvider: "alchemypay",
      status:         "LIQUIDATING_FIAT",
      transferId:     result.transferId,
    });

    return NextResponse.json({ order_id: body.orderId, ...result });
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error("[alchemypay/offramp/create] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Off-ramp error", errorCode: code },
      { status: code ? 422 : 500 },
    );
  }
}
