// POST /api/bridge/checkout
//
// RECEPTOR generates a payment link.
// Flow:
//   1. Receptor provides name, email, country, receive method (card or bank), account details, amount
//   2. Server creates/finds customer in Bridge (KYC)
//   3. If KYC incomplete → return KYC link (202). Receptor must complete, then call again.
//   4. Server creates a liquidation address (where USDC will flow into their bank/card)
//   5. Server encrypts metadata into a token
//   6. Returns shareable link: ${APP_URL}/pagar?t={token}&type=p2p
//
// The link has NO expiry — amount is always recalculated live when sender opens it.

import { NextRequest, NextResponse }       from "next/server";
import { getOrCreateCustomer, getKycLink } from "@/providers/bridge/customers";
import { createLiquidationAddress, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams, ReceiveMethod } from "@/providers/bridge/liquidation";
import { encryptPayload }                  from "@/lib/accountcrypto";
import { getTargetCurrency }               from "@/lib/routing";

export const runtime = "edge";

interface CheckoutBody {
  nombre:           string;
  email:            string;
  country:          string;
  receive_method:   ReceiveMethod;
  card_number?:     string;
  clabe?:           string;
  iban?:            string;
  pix_key?:         string;
  routing_number?:  string;
  account_number?:  string;
  sort_code?:       string;
  transit_number?:  string;
  ifsc?:            string;
  amount_target:    number;
  recipient_phone?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: CheckoutBody;
  try { body = await req.json() as CheckoutBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    nombre, email, country, receive_method,
    card_number, clabe, iban, pix_key, routing_number, account_number,
    sort_code, transit_number, ifsc,
    amount_target, recipient_phone,
  } = body;

  if (!nombre || !email || !country || !receive_method || !amount_target) {
    return NextResponse.json(
      { error: "nombre, email, country, receive_method, and amount_target are required" },
      { status: 400 },
    );
  }
  if (receive_method === "card" && !card_number) {
    return NextResponse.json({ error: "card_number is required for card receive" }, { status: 400 });
  }
  if (receive_method === "bank" && !NATIVE_RAILS[country.toUpperCase()]) {
    return NextResponse.json(
      { error: `No native bank rail for ${country}. Use receive_method: "card" instead.` },
      { status: 400 },
    );
  }

  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";
  const country_upper = country.toUpperCase();

  try {
    // 1. Get or create Bridge customer (KYC)
    const { customer, needsKyc } = await getOrCreateCustomer({
      type:       "individual",
      email:      email.toLowerCase(),
      first_name: nombre.split(" ")[0],
      last_name:  nombre.split(" ").slice(1).join(" ") || "-",
    });

    // 2. KYC gate — Bridge requires approved customer before creating liquidation address
    if (needsKyc) {
      let kycUrl: string | null = null;
      try {
        const kycLink = await getKycLink(customer.id);
        kycUrl = kycLink.url;
      } catch { /* non-critical */ }
      return NextResponse.json({
        needs_kyc:   true,
        kyc_url:     kycUrl,
        customer_id: customer.id,
        message:     "Complete KYC verification first, then generate your payment link again.",
      }, { status: 202 });
    }

    // 3. Create liquidation address (Bridge converts USDC → local fiat → bank/card)
    const liqParams: CreateLiquidationParams = {
      customerId:    customer.id,
      country:       country_upper,
      receiveMethod: receive_method,
      ownerName:     nombre,
      ownerType:     "individual",
      cardNumber:    card_number,
      clabe, iban, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      sortCode: sort_code, transitNumber: transit_number, ifsc,
    };
    const liqAddr = await createLiquidationAddress(liqParams);

    // 4. Encrypt metadata into token
    const targetCurrency = getTargetCurrency(country_upper);
    const meta = JSON.stringify({
      liq_addr_id:      liqAddr.id,
      liq_addr_address: liqAddr.address,
      customer_id:      customer.id,
      nombre,
      country:          country_upper,
      target_currency:  targetCurrency,
      amount_target,
      receive_method,
      recipient_phone,
    });
    const metaToken = await encryptPayload({
      account:        meta,
      receiveMode:    receive_method === "card" ? "card" : "bank",
      recipientPhone: recipient_phone,
    });

    const payLink = `${appUrl}/pagar?t=${metaToken}&type=p2p`;

    return NextResponse.json({
      pay_link:        payLink,
      token:           metaToken,
      customer_id:     customer.id,
      liq_addr_id:     liqAddr.id,
      usdc_address:    liqAddr.address,
      needs_kyc:       false,
      amount_target,
      target_currency: targetCurrency,
      country:         country_upper,
      receive_method,
      share_message:   `OmniPay — Envíame dinero a través de este link: ${payLink}`,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/checkout]", err.message, err.type, err.status, JSON.stringify(err.details));
    return NextResponse.json({
      error:          err.message,
      bridge_type:    err.type ?? null,
      bridge_details: err.details ?? null,
    }, { status: err.status ?? 500 });
  }
}
