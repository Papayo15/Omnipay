// GET /api/alchemypay/order/preview?t=<token>
//
// Decrypts just enough of the link for the sender-facing page to show who
// they're paying and how much — never exposes the on-chain deposit address.

import { NextRequest, NextResponse } from "next/server";
import { decryptPayload } from "@/lib/accountcrypto";

export const runtime = "nodejs";

interface OrderMeta {
  order_type:         "p2p" | "b2b-bridge";
  recipient_name:     string;
  recipient_country:  string;
  recipient_currency: string;
  recipient_amount:   number;
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.json({ error: "t is required" }, { status: 400 });

  try {
    const payload = await decryptPayload(token);
    const meta = JSON.parse(payload.account) as OrderMeta;
    return NextResponse.json({
      order_type: meta.order_type,
      recipient: {
        name:     meta.recipient_name,
        country:  meta.recipient_country,
        amount:   meta.recipient_amount,
        currency: meta.recipient_currency,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }
}
