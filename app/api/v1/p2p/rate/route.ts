import { NextRequest, NextResponse } from "next/server";
import { getBitsoUSDCRate, calcP2PFee } from "@/lib/bitso";

// GET /api/v1/p2p/rate?amount_mxn=5000
//
// Retorna cotización en vivo: cuánto debe pagar el remitente en USD
// para que el receptor reciba {amount_mxn} MXN.
//
// Sin credenciales Bitso → usa precio de mercado público (ticker público, sin auth).

export async function GET(req: NextRequest) {
  const amountMxn = parseFloat(req.nextUrl.searchParams.get("amount_mxn") ?? "0");

  if (!amountMxn || amountMxn < 100) {
    return NextResponse.json({ error: "amount_mxn debe ser mayor a 100" }, { status: 400 });
  }

  try {
    const rateMxnPerUsdc = await getBitsoUSDCRate();  // MXN por 1 USDC
    const usdcNeeded     = amountMxn / rateMxnPerUsdc; // USDC neto para el receptor
    const feeUsdc        = calcP2PFee(usdcNeeded);     // fee OmniPay
    const usdcTotal      = usdcNeeded + feeUsdc;       // USDC que debe llegar a OmniPay

    // El pagador paga usdcTotal en USD (1 USDC ≈ 1 USD)
    // Ramp agrega ~2.5% adicional por su procesamiento — mostrar como referencia
    const rampFeeEstimate = usdcTotal * 0.025;
    const senderPaysUsd   = usdcTotal + rampFeeEstimate;

    return NextResponse.json({
      amount_mxn:         amountMxn,
      rate_mxn_per_usdc:  parseFloat(rateMxnPerUsdc.toFixed(4)),
      usdc_needed:        parseFloat(usdcNeeded.toFixed(2)),
      omnipay_fee_usdc:   parseFloat(feeUsdc.toFixed(2)),
      usdc_subtotal:      parseFloat(usdcTotal.toFixed(2)),
      ramp_fee_estimate:  parseFloat(rampFeeEstimate.toFixed(2)),
      sender_pays_usd:    parseFloat(senderPaysUsd.toFixed(2)),
      note:               "sender_pays_usd incluye ~2.5% fee de Ramp/Transak (el pagador lo ve en el widget)",
    });
  } catch (err) {
    console.error("[p2p/rate] error:", err);
    return NextResponse.json({ error: "No se pudo obtener la cotización" }, { status: 503 });
  }
}
