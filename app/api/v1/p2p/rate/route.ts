import { NextRequest, NextResponse } from "next/server";
import { getBitsoUSDCRate, calcP2PFee, RAMP_FEE_EST, P2PFeeBreakdown } from "@/lib/bitso";
import { selectP2PRail, getTargetCurrency } from "@/lib/routing";
import { getWiseLivePrice } from "@/lib/wise-p2p";

// GET /api/v1/p2p/rate
//
// Query params:
//   amount_target  — amount in target_currency the recipient should get
//   target_country — ISO-3166 alpha-2, default "MX"
//
// Returns full fee breakdown for the UI fee calculator.

export async function GET(req: NextRequest) {
  const params        = req.nextUrl.searchParams;
  const amountTarget  = parseFloat(params.get("amount_target") ?? params.get("amount_mxn") ?? "0");
  const targetCountry = (params.get("target_country") ?? "MX").toUpperCase();

  if (!amountTarget || amountTarget < 50) {
    return NextResponse.json({ error: "amount_target must be greater than 50" }, { status: 400 });
  }

  try {
    const targetCurrency = getTargetCurrency(targetCountry);
    const rail           = selectP2PRail(targetCountry);
    const isWiseEmergency = rail === "wise";

    // Live rate
    let rateToTarget = 1.0;
    let usdcNeeded   = amountTarget;

    if (targetCountry === "MX") {
      const mxnPerUsdc = await getBitsoUSDCRate("usdc_mxn");
      usdcNeeded       = amountTarget / mxnPerUsdc;
      rateToTarget     = mxnPerUsdc;
    } else if (targetCurrency !== "USD") {
      try {
        const res  = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
        const data = await res.json() as { rates: Record<string, number> };
        const rate = data.rates[targetCurrency];
        if (rate) { usdcNeeded = amountTarget / rate; rateToTarget = rate; }
      } catch { /* use default */ }
    }

    // Live partner fee (Wise spread for non-Bitso routes)
    let networkDeliveryFee = 0;
    if (isWiseEmergency) {
      const wisePrice = await getWiseLivePrice(
        process.env.WISE_API_KEY ?? "",
        usdcNeeded,
        "USD",
        targetCurrency,
      );
      networkDeliveryFee = wisePrice.fee;
    }
    // Bitso: spread embedded in rate (~0 separate fee)

    const omniPayFee      = calcP2PFee(usdcNeeded, isWiseEmergency);
    const usdcSubtotal    = parseFloat((usdcNeeded + omniPayFee).toFixed(6));
    const rampFeeEst      = parseFloat((usdcSubtotal * RAMP_FEE_EST).toFixed(2));
    const totalSenderPays = parseFloat((usdcSubtotal + rampFeeEst + networkDeliveryFee).toFixed(2));

    const breakdown: P2PFeeBreakdown = {
      amount_principal:      amountTarget,
      ramp_fee_estimate:     rampFeeEst,
      omnipay_platform_fee:  parseFloat(omniPayFee.toFixed(2)),
      network_delivery_fee:  parseFloat(networkDeliveryFee.toFixed(2)),
      fx_buffer_applied:     isWiseEmergency,
      usdc_subtotal:         usdcSubtotal,
      total_sender_pays:     totalSenderPays,
      route_used:            rail === "bitso" ? "bitso" : "wise_emergency",
    };

    return NextResponse.json({
      target_country:   targetCountry,
      target_currency:  targetCurrency,
      rate_to_target:   parseFloat(rateToTarget.toFixed(4)),
      ...breakdown,
      note: "total_sender_pays includes Ramp/Transak ~2.5% pay-in fee shown in widget",
    });
  } catch (err) {
    console.error("[p2p/rate] error:", err);
    return NextResponse.json({ error: "Could not fetch quote" }, { status: 503 });
  }
}
