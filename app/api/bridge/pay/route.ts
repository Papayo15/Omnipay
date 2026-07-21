// POST /api/bridge/pay
//
// EMISOR (sender) initiates the payment after opening the receptor's link.
// Flow:
//   1. Emisor provides name, email, source currency (USD/CAD), and the encrypted token
//   2. Server decrypts token → gets liquidation address + receptor info
//   3. Server gets/creates KYC for emisor in Bridge
//   4. Server creates a Virtual Account for the emisor to wire/ACH into
//   5. Returns: virtual account bank details (routing + account number) + fee quote
//   6. Emisor pays into the VA. Bridge auto-routes to receptor's liquidation address.

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCustomer, getKycLink } from "@/providers/bridge/customers";
import { createVirtualAccount }        from "@/providers/bridge/virtual-accounts";
import { decryptPayload }              from "@/lib/accountcrypto";
import { buildDynamicQuote }           from "@/lib/bridge-fees";
import { createOrder }                 from "@/lib/order-state";

export const runtime = "edge";

interface PayBody {
  token:           string;   // encrypted token from checkout link
  sender_name:     string;
  sender_email:    string;
  source_currency: "usd" | "cad" | "eur" | "gbp";
  // Optional phone for SMS notification
  sender_phone?:   string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: PayBody;
  try { body = await req.json() as PayBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { token, sender_name, sender_email, source_currency, sender_phone } = body;

  if (!token || !sender_name || !sender_email || !source_currency) {
    return NextResponse.json(
      { error: "token, sender_name, sender_email, and source_currency are required" },
      { status: 400 },
    );
  }

  try {
    // 1. Decrypt token to get receptor's liquidation address and order details
    const decrypted = await decryptPayload(token);
    let meta: {
      liq_addr_id:      string;
      customer_id:      string;
      nombre:           string;
      country:          string;
      target_currency:  string;
      amount_target:    number;
      receive_method:   string;
      recipient_phone?: string;
    };

    try { meta = JSON.parse(decrypted.account); }
    catch { return NextResponse.json({ error: "Invalid or tampered payment token" }, { status: 400 }); }

    // 2. Build fee quote with dynamic KYC check for the SENDER
    const quote = await buildDynamicQuote({
      amount: meta.amount_target,
      email:  sender_email.toLowerCase(),
      type:   "p2p",
    });

    // 3. Get or create Bridge customer for the SENDER (KYC)
    const { customer: senderCustomer, needsKyc } = await getOrCreateCustomer({
      type:       "individual",
      email:      sender_email.toLowerCase(),
      first_name: sender_name.split(" ")[0],
      last_name:  sender_name.split(" ").slice(1).join(" ") || "-",
    });

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";
    const orderId   = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 4. Create Virtual Account for sender to deposit into
    // Bridge auto-converts USD/CAD → USDC → routes to liq_addr_id
    const omnipayFeeStr = (quote.omnipay_service + quote.omnipay_flat).toFixed(2);
    const va = await createVirtualAccount({
      customerId:          senderCustomer.id,
      sourceCurrency:      source_currency,
      destinationRail:     meta.receive_method === "card" ? "card" : "spei",
      destinationCurrency: meta.target_currency.toLowerCase(),
      developerFeeUsd:     omnipayFeeStr,
      reference:           orderId,
      webhookUrl:          `${appUrl}/api/bridge/webhook`,
    });

    // 5. Create local order for tracking
    createOrder(orderId, {
      destinationCountry: meta.country,
      targetCurrency:     meta.target_currency,
      recipientName:      meta.nombre,
      recipientAccount:   meta.liq_addr_id,
      payInProvider:      "bridge-va",
      payOutProvider:     "bridge-liq",
    });

    // 6. If KYC needed, get Bridge hosted KYC link for sender
    let kycUrl: string | null = null;
    if (needsKyc) {
      try {
        const kycLink = await getKycLink(senderCustomer.id);
        kycUrl = kycLink.url;
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      order_id:       orderId,
      status:         "PENDING_PAYIN",
      // Virtual account details the sender uses to wire/ACH money
      virtual_account: {
        bank_name:       va.bank_name ?? "Cross River Bank (via Bridge)",
        routing_number:  va.routing_number,
        account_number:  va.account_number,
        currency:        source_currency.toUpperCase(),
        instructions:    va.instructions ?? `Wire/ACH ${quote.total_sender_pays.toFixed(2)} ${source_currency.toUpperCase()} to this account. Funds arrive to recipient in minutes via ${meta.country === "MX" ? "SPEI" : meta.receive_method}.`,
      },
      // Full fee breakdown for the sender to see
      fee_breakdown: {
        amount_principal:  quote.amount_principal,
        bridge_onramp:     quote.bridge_onramp,
        bridge_offramp:    quote.bridge_offramp,
        omnipay_service:   quote.omnipay_service,
        omnipay_flat:      quote.omnipay_flat,
        kyc_surcharge:     quote.kyc_surcharge,
        is_new_customer:   quote.is_new_customer,
        total_to_send:     quote.total_sender_pays,
        recipient_gets:    `${meta.amount_target} ${meta.target_currency}`,
      },
      recipient: {
        name:    meta.nombre,
        country: meta.country,
        method:  meta.receive_method,
      },
      needs_kyc: needsKyc,
      kyc_url:   kycUrl,
      track_url: `${appUrl}/api/bridge/track?order_id=${orderId}`,
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[bridge/pay]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
