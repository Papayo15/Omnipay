// POST /api/bridge/checkout
//
// RECEPTOR generates a payment link.
// Flow:
//   1. Receptor provides name, email, country, receive method (card or bank), account details, amount
//   2. Server creates/finds customer in Bridge (KYC)
//   3. Server creates a liquidation address (where USDC will flow into their bank/card)
//   4. Server encrypts { customer_id, liq_addr_id, amount, nombre, country, receive_method }
//   5. Returns shareable link: ${APP_URL}/pagar?t={token}&type=p2p
//
// The link has NO expiry — amount is always recalculated live when sender opens it.

import { NextRequest, NextResponse }     from "next/server";
import { getOrCreateCustomer, getKycLink } from "@/providers/bridge/customers";
import { createLiquidationAddress, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams, ReceiveMethod } from "@/providers/bridge/liquidation";
import { encryptPayload }                from "@/lib/accountcrypto";
import { getTargetCurrency }             from "@/lib/routing";

export const runtime = "edge";

interface CheckoutBody {
  // Who is the receptor
  nombre:          string;
  email:           string;
  country:         string;
  // How they want to receive
  receive_method:  ReceiveMethod;   // "card" | "bank"
  // Card fields
  card_number?:    string;
  // Bank fields — depend on country
  clabe?:          string;
  iban?:           string;
  pix_key?:        string;
  routing_number?: string;
  account_number?: string;
  sort_code?:      string;
  transit_number?: string;
  ifsc?:           string;
  // Amount the receptor wants to receive (in their local currency)
  amount_target:   number;
  // Optional: phone for SMS notification when payment arrives
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

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";
  const secret  = process.env.LINK_SECRET ?? "";
  const country_upper = country.toUpperCase();

  try {
    // 1. Get or create Bridge customer (KYC)
    const { customer, needsKyc } = await getOrCreateCustomer({
      type:       "individual",
      email:      email.toLowerCase(),
      first_name: nombre.split(" ")[0],
      last_name:  nombre.split(" ").slice(1).join(" ") || "-",
    });

    // 2. Create liquidation address (Bridge converts USDC → local fiat → bank/card)
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

    // 3. Encrypt token — no expiry (amount recalculated live at pay time)
    const targetCurrency = getTargetCurrency(country_upper);
    const token = await encryptPayload({
      account:        liqAddr.id,               // liquidation_address_id used at pay time
      receiveMode:    receive_method === "card" ? "card" : "bank",
      recipientPhone: recipient_phone,
      // Extra context packed into account field as JSON prefix (decoded in /pay)
    });

    // Pack extra metadata as a separate AES-encrypted field by reusing the same mechanism
    // with a discriminated prefix. We embed JSON into the "account" field with a prefix.
    const meta = JSON.stringify({
      liq_addr_id:      liqAddr.id,
      liq_addr_address: liqAddr.address,  // Polygon USDC address — VA destination
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

    // 4. If KYC needed, get Bridge hosted KYC link for the receptor to complete
    let kycUrl: string | null = null;
    if (needsKyc) {
      try {
        const kycLink = await getKycLink(customer.id);
        kycUrl = kycLink.url;
      } catch { /* non-critical — receptor can complete KYC later */ }
    }

    return NextResponse.json({
      pay_link:         payLink,
      token:            metaToken,
      customer_id:      customer.id,
      liq_addr_id:      liqAddr.id,
      usdc_address:     liqAddr.address,
      needs_kyc:        needsKyc,
      kyc_url:          kycUrl,
      amount_target,
      target_currency:  targetCurrency,
      country:          country_upper,
      receive_method,
      // Instructions to share with the sender
      share_message:    `OmniPay — Envíame dinero a través de este link: ${payLink}`,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/checkout]", err.message, err.type, err.status, JSON.stringify(err.details));
    return NextResponse.json({
      error:        err.message,
      bridge_type:  err.type ?? null,
      bridge_details: err.details ?? null,
    }, { status: err.status ?? 500 });
  }
}
