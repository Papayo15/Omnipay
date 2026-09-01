// POST /api/alchemypay/order/pay
//
// Alchemy Pay equivalent of /api/bridge/pay. The SENDER opens the link the
// recipient generated (/api/alchemypay/order/request), picks their own fiat
// amount/currency/country, and this creates the on-ramp order targeting the
// deposit address Alchemy Pay's off-ramp order is already watching — the
// whole fiat → crypto → fiat cycle happens inside Alchemy Pay, no Bridge
// involved.

import { NextRequest, NextResponse } from "next/server";
import { createOnRampOrder } from "@/providers/alchemypay/onramp";
import { decryptPayload }    from "@/lib/accountcrypto";
import { createOrder }       from "@/lib/order-state";

export const runtime = "nodejs";

const NETWORK = "MATIC";

interface OrderMeta {
  order_id:           string;
  order_type:         "p2p" | "b2b-bridge";
  address:            string;
  recipient_name:     string;
  recipient_country:  string;
  recipient_currency: string;
  recipient_amount:   number;
  account_number:     string;
  bank_code?:         string;
}

interface PayBody {
  token:              string;
  senderName?:        string;
  senderEmail:        string;
  senderCountry:      string;   // ISO 3166-1 alpha-2
  senderFiatAmount:   number;
  senderFiatCurrency: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: PayBody = await req.json();
    if (!body.token || !body.senderEmail || !body.senderCountry
        || !body.senderFiatAmount || !body.senderFiatCurrency) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let meta: OrderMeta;
    try {
      const payload = await decryptPayload(body.token);
      meta = JSON.parse(payload.account) as OrderMeta;
    } catch {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const onRampOrder = await createOnRampOrder({
      merchantOrderNo: meta.order_id,
      fiatAmount:      body.senderFiatAmount,
      fiatCurrency:    body.senderFiatCurrency,
      country:         body.senderCountry,
      crypto:          "USDC",
      network:         NETWORK,
      address:         meta.address,
      email:           body.senderEmail,
      redirectUrl:     `${appUrl}/pagar-alchemypay?order_id=${meta.order_id}&ap_status=completed`,
    });

    createOrder(meta.order_id, {
      orderType:               meta.order_type,
      destinationCountry:      meta.recipient_country,
      targetCurrency:          meta.recipient_currency,
      recipientName:           meta.recipient_name,
      recipientAccount:        meta.account_number,
      payInProvider:           "alchemypay",
      payOutProvider:          "alchemypay",
      recipientOnchainAddress: meta.address,
      amount:                  body.senderFiatAmount,
      senderEmail:             body.senderEmail.toLowerCase(),
      recipientEmail:          undefined,
      trackUrl:                `${appUrl}/seguimiento?order_id=${meta.order_id}`,
    });

    return NextResponse.json({
      order_id: meta.order_id,
      pay_link: onRampOrder.payLink,
      recipient: {
        name:     meta.recipient_name,
        country:  meta.recipient_country,
        amount:   meta.recipient_amount,
        currency: meta.recipient_currency,
      },
    });
  } catch (err) {
    console.error("[alchemypay/order/pay] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Alchemy Pay pay error" },
      { status: 500 },
    );
  }
}
