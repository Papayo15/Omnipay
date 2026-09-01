// POST /api/alchemypay/order/request
//
// Alchemy Pay equivalent of /api/bridge/checkout — used for countries with no
// native Bridge rail (see lib/funding-provider.ts). The RECIPIENT calls this
// to generate a shareable pay link; the SENDER opens it and completes payment
// via /api/alchemypay/order/pay.
//
// We create the off-ramp order now, while we already know the recipient's
// bank details — Alchemy Pay needs that deposit address active before any
// crypto lands on it (see providers/alchemypay/offramp.ts). The address gets
// embedded (encrypted) in the link; the sender never sees it.

import { NextRequest, NextResponse } from "next/server";
import { getQuote }           from "@/providers/alchemypay/quote";
import { createOffRampOrder } from "@/providers/alchemypay/offramp";
import { encryptPayload }     from "@/lib/accountcrypto";

export const runtime = "nodejs";

const NETWORK = "MATIC"; // Polygon — Alchemy Pay's network code

interface RequestBody {
  orderType:       "p2p" | "b2b-bridge";
  recipientName:   string;
  recipientEmail?: string;
  recipientCountry:  string;   // ISO 3166-1 alpha-2
  recipientCurrency: string;   // ISO-4217
  recipientAmount:   number;   // how much the recipient wants to receive
  accountNumber:     string;   // bank account / IBAN / PayID depending on country
  bankCode?:         string;   // BSB / sort code / routing number, if applicable
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: RequestBody = await req.json();
    if (!body.orderType || !body.recipientName || !body.recipientCountry
        || !body.recipientCurrency || !body.recipientAmount || !body.accountNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const orderId = `OP-AP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Estimate the crypto amount needed to produce recipientAmount in fiat —
    // a BUY-side quote is the closest available approximation (see
    // providers/alchemypay/quote.ts; exact off-ramp pricing is confirmed by
    // Alchemy Pay itself when the order is created).
    const estimate = await getQuote({
      side:    "BUY",
      crypto:  "USDC",
      network: NETWORK,
      fiat:    body.recipientCurrency,
      amount:  body.recipientAmount,
    });
    const cryptoAmount = Number(estimate.cryptoQuantity ?? 0);
    if (!cryptoAmount) {
      return NextResponse.json({ error: "Could not estimate crypto amount for this quote" }, { status: 502 });
    }

    const offRampOrder = await createOffRampOrder({
      merchantOrderNo: `${orderId}-OUT`,
      cryptoAmount,
      crypto:          "USDC",
      network:         NETWORK,
      fiatCurrency:    body.recipientCurrency,
      country:         body.recipientCountry,
      bank: {
        accountName:   body.recipientName,
        accountNumber: body.accountNumber,
        bankCode:      body.bankCode,
      },
    });

    const meta = JSON.stringify({
      order_id:           orderId,
      order_type:          body.orderType,
      address:             offRampOrder.address,
      recipient_name:      body.recipientName,
      recipient_country:   body.recipientCountry,
      recipient_currency:  body.recipientCurrency,
      recipient_amount:    body.recipientAmount,
      account_number:      body.accountNumber,
      bank_code:           body.bankCode,
    });
    const token = await encryptPayload({ account: meta, receiveMode: "bank", senderEmail: body.recipientEmail });

    const payLink = `${appUrl}/pagar-alchemypay?t=${token}&type=${body.orderType}`;

    return NextResponse.json({
      order_id:  orderId,
      pay_link:  payLink,
      recipient_amount:   body.recipientAmount,
      recipient_currency: body.recipientCurrency,
    });
  } catch (err) {
    console.error("[alchemypay/order/request] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alchemy Pay request error" },
      { status: 500 },
    );
  }
}
