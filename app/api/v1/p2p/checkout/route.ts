import { NextRequest, NextResponse } from "next/server";
import { getBitsoUSDCRate, calcP2PFee, RAMP_FEE_EST } from "@/lib/bitso";
import { selectP2PRail, getTargetCurrency } from "@/lib/routing";
import { buildOnRampWidgetUrl } from "@/lib/onramp";
import type { OnRampProvider } from "@/lib/onramp";

// POST /api/v1/p2p/checkout
//
// Genera token AES-256-GCM con { account, payout_method, nombre, amount_target,
// target_country, target_currency, created_at } y config del widget Ramp/Transak.
// Stateless puro — el webhook desencripta el token para saber a dónde enviar.

export interface P2PToken {
  account:          string;   // CLABE / bank account / 16-digit card number
  payout_method:    "bank" | "card";
  nombre:           string;
  amount_target:    number;
  target_currency:  string;
  target_country:   string;
  recipient_phone?: string;
  payer_phone?:     string;
  created_at:       number;
}

async function encryptP2PToken(payload: P2PToken, secret: string): Promise<string> {
  const enc         = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret.slice(0, 32).padEnd(32, "0")),
    "AES-GCM", false, ["encrypt"],
  );
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const data      = enc.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keyMaterial, data);
  const combined  = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return Buffer.from(combined).toString("base64url");
}

interface CheckoutBody {
  nombre?:          string;
  account?:         string;
  payout_method?:   "bank" | "card";
  amount_target?:   number;
  target_country?:  string;
  recipient_phone?: string;
  payer_phone?:     string;
}

export async function POST(req: NextRequest) {
  const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
  const bitsoAddr  = process.env.OMNIPAY_BITSO_USDC_ADDRESS;
  const provider   = (process.env.NEXT_PUBLIC_ONRAMP_PROVIDER ?? "ramp") as OnRampProvider;

  if (!bitsoAddr) {
    return NextResponse.json(
      { error: "P2P service not yet configured. Awaiting credentials." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json() as CheckoutBody;
    const {
      nombre, account, payout_method = "bank",
      amount_target, target_country = "MX",
      recipient_phone, payer_phone,
    } = body;

    if (!nombre || !account || !amount_target) {
      return NextResponse.json({ error: "nombre, account, and amount_target are required" }, { status: 400 });
    }
    if (payout_method === "card" && !/^\d{16}$/.test(account.replace(/\s/g, ""))) {
      return NextResponse.json({ error: "Card number must be 16 digits" }, { status: 400 });
    }
    if (payout_method === "bank" && target_country === "MX" && !/^\d{18}$/.test(account)) {
      return NextResponse.json({ error: "CLABE must be 18 digits" }, { status: 400 });
    }

    const target_currency = getTargetCurrency(target_country);
    const route           = selectP2PRail(target_country);
    const isWiseEmergency = route === "wise";

    // Live rate
    let rateToTarget = 1.0;
    let usdcNeeded   = amount_target;

    if (target_country === "MX") {
      const mxnPerUsdc = await getBitsoUSDCRate("usdc_mxn");
      usdcNeeded       = amount_target / mxnPerUsdc;
      rateToTarget     = mxnPerUsdc;
    } else if (target_currency !== "USD") {
      try {
        const res  = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
        const data = await res.json() as { rates: Record<string, number> };
        const rate = data.rates[target_currency];
        if (rate) { usdcNeeded = amount_target / rate; rateToTarget = rate; }
      } catch { /* use default */ }
    }

    const feeUsdc         = calcP2PFee(usdcNeeded, isWiseEmergency);
    const usdcSubtotal    = parseFloat((usdcNeeded + feeUsdc).toFixed(6));
    const rampFeeEst      = parseFloat((usdcSubtotal * RAMP_FEE_EST).toFixed(2));
    const totalSenderPays = parseFloat((usdcSubtotal + rampFeeEst).toFixed(2));

    const tokenPayload: P2PToken = {
      account:         account.replace(/\s/g, ""),
      payout_method,
      nombre,
      amount_target,
      target_currency,
      target_country,
      recipient_phone: recipient_phone || undefined,
      payer_phone:     payer_phone     || undefined,
      created_at:      Date.now(),
    };

    const partnerOrderId = await encryptP2PToken(tokenPayload, linkSecret);
    const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? "";

    const widgetUrl = buildOnRampWidgetUrl({
      partnerOrderId,
      usdcAmount:    usdcSubtotal,
      walletAddress: bitsoAddr,
      finalUrl:      `${appUrl}/p2p?pid=${partnerOrderId.slice(0, 12)}&n=${encodeURIComponent(nombre)}`,
      provider,
    });

    return NextResponse.json({
      partnerOrderId,
      provider,
      widget_url: widgetUrl,
      estimate: {
        recipient_gets:        amount_target,
        target_currency,
        rate_to_target:        parseFloat(rateToTarget.toFixed(4)),
        usdc_subtotal:         usdcSubtotal,
        omnipay_fee_usdc:      parseFloat(feeUsdc.toFixed(2)),
        ramp_fee_estimate:     rampFeeEst,
        total_sender_pays_usd: totalSenderPays,
        fx_buffer_applied:     isWiseEmergency,
        route_used:            route === "bitso" ? "bitso" : "wise_emergency",
      },
    });
  } catch (err) {
    console.error("[p2p/checkout] error:", err);
    return NextResponse.json({ error: "Error generating checkout" }, { status: 500 });
  }
}
