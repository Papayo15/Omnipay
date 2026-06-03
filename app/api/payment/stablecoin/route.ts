import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Stablecoin bridge via Binance Pay — países con control cambiario o restricciones OFAC:
// VE, NG, PK, EG, TR, GH, KE, UG, TZ, RU
//
// Binance Pay opera fuera de jurisdicción OFAC directa para personas físicas en México.
// El receptor ve "Transferencia Internacional" — nunca terminología cripto.
// Los fondos se convierten internamente de USDT a moneda local por Binance.
//
// Configurar en Binance Merchant Center: bpay.binance.com
// BINANCE_PAY_API_KEY + BINANCE_PAY_SECRET_KEY

async function buildBinanceSignature(
  timestamp: string,
  nonce: string,
  body: string,
  secret: string
): Promise<string> {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function POST(req: NextRequest) {
  try {
    const { receiverToken, amount, feeAmount, currency } = await req.json() as {
      receiverToken: string;
      amount: number;
      feeAmount: number;
      currency: string;
    };

    const apiKey    = process.env.BINANCE_PAY_API_KEY    ?? "";
    const apiSecret = process.env.BINANCE_PAY_SECRET_KEY ?? "";

    if (!apiKey) {
      return NextResponse.json({ error: "Binance Pay not configured" }, { status: 503 });
    }

    const netAmount  = (amount - feeAmount).toFixed(2);
    const tradeNo    = `OP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp  = String(Date.now());
    const nonce      = crypto.randomUUID().replace(/-/g, "");

    const bodyObj = {
      env: { terminalType: "APP" },
      merchantTradeNo: tradeNo,
      orderAmount: netAmount,
      currency: "USDT",
      description: "OmniPay — Transferencia Internacional",
      goods: {
        goodsType: "01",
        goodsCategory: "Z000",
        referenceGoodsId: tradeNo,
        goodsName: "Transferencia Internacional OmniPay",
        goodsDetail: `Envío a ${currency}`,
      },
      buyer: {
        referenceBuyerId: receiverToken, // tarjeta MIR, wallet ID, o phone
        buyerName: { firstName: "Receptor", lastName: "OmniPay" },
      },
      // settleInfo: recipient receives local currency equivalent
      settleInfo: {
        settleDetail: [{ settleType: 0, settleValue: "1" }],
      },
    };

    const bodyStr   = JSON.stringify(bodyObj);
    const signature = await buildBinanceSignature(timestamp, nonce, bodyStr, apiSecret);

    const res = await fetch("https://bpay.binanceapi.com/binancepay/openapi/v2/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "BinancePay-Timestamp": timestamp,
        "BinancePay-Nonce": nonce,
        "BinancePay-Certificate-SN": apiKey,
        "BinancePay-Signature": signature,
      },
      body: bodyStr,
    });

    const data = await res.json() as { status: string; code: string; data?: { prepayId: string; checkoutUrl?: string } };

    if (!res.ok || data.status !== "SUCCESS") {
      console.error("Binance Pay error:", data);
      return NextResponse.json({ error: "Binance Pay error", detail: data.code }, { status: 400 });
    }

    const prepayId = data.data?.prepayId ?? tradeNo;

    return NextResponse.json({
      tx_id: prepayId,
      status: "pending",
      checkout_url: data.data?.checkoutUrl,
    });
  } catch (e: unknown) {
    console.error("Stablecoin route error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
