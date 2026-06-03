import { NextRequest, NextResponse } from "next/server";
import { sendPaymentNotification } from "@/lib/notify";
import { buildReceiptURL } from "@/lib/payload";
import type { ReceiptPayload } from "@/lib/payload";

export const runtime = "edge";

// Internal endpoint called by the frontend after payment confirmation.
// Builds the audit URL and sends SMS/WhatsApp notification to the recipient.
// No data stored. Stateless.

export async function POST(req: NextRequest) {
  try {
    const { tx_id, rail, amount, currency, recipient_phone, bank_name, country, transaction_type } =
      await req.json() as {
        tx_id: string;
        rail: string;
        amount: number;
        currency: string;
        recipient_phone: string;
        bank_name?: string;
        country?: string;
        transaction_type?: string;
      };

    if (!recipient_phone || !amount || !currency) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const receipt: ReceiptPayload = {
      id: tx_id ?? "",
      a: amount,
      c: currency,
      nb: bank_name ?? "",
      cn: country ?? "",
      ts: Date.now(),
      tt: transaction_type ?? "generic",
      r: rail ?? "wise",
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const auditUrl = await buildReceiptURL(receipt, baseUrl);

    // Fire-and-forget
    sendPaymentNotification(recipient_phone, auditUrl, amount, currency).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
