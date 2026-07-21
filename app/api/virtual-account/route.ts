// POST /api/virtual-account
//
// Creates a Bridge virtual account for the sender to deposit into.
// Simplified Bridge-only version — no multi-provider fallback.
//
// Body: { order_id, customer_name, destination_country, source_currency?, customer_id? }

import { NextResponse }       from "next/server";
import { createVirtualAccount } from "@/providers/bridge/virtual-accounts";
import { getTargetCurrency }  from "@/lib/routing";
import { NATIVE_RAILS }       from "@/providers/bridge/liquidation";

export const runtime = "edge";

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const orderId           = String(body.order_id ?? "");
  const customerId        = String(body.customer_id ?? "");
  const destinationCountry = String(body.destination_country ?? "MX").toUpperCase();
  const sourceCurrency    = String(body.source_currency ?? "usd").toLowerCase() as "usd" | "cad" | "eur" | "gbp";

  if (!orderId)    return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  if (!customerId) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });

  const targetCurrency = getTargetCurrency(destinationCountry);
  const native         = NATIVE_RAILS[destinationCountry];
  const destinationRail = native?.rail ?? "card";
  const appUrl          = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.ca";

  try {
    const va = await createVirtualAccount({
      customerId,
      sourceCurrency,
      destinationRail,
      destinationCurrency: targetCurrency.toLowerCase(),
      reference:           orderId,
      webhookUrl:          `${appUrl}/api/bridge/webhook`,
    });

    return NextResponse.json({
      account_id:     va.id,
      provider:       "bridge",
      bank_name:      va.bank_name ?? "Bridge Virtual Bank",
      currency:       sourceCurrency.toUpperCase(),
      routing_number: va.routing_number ?? null,
      account_number: va.account_number ?? null,
      swift_code:     va.swift_code ?? null,
      instructions:   va.instructions ?? "Wire/ACH to this account.",
      destination_country: destinationCountry,
      destination_rail:    destinationRail,
      created_at:     new Date().toISOString(),
    });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: `Bridge error: ${msg}` }, { status: 503 });
  }
}
