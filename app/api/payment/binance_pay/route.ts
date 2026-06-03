import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Binance Pay — ruta especial para mercados restringidos (Rusia / control cambiario)
// Autenticación: HMAC-SHA512 sobre nonce + timestamp + body
// Documentación: https://developers.binance.com/docs/binance-pay

interface BinancePayRequest {
  amount: number;
  currency: string;          // moneda origen
  targetCurrency?: string;   // moneda destino
  bankToken: string;         // wallet address o ID receptor
  receiverName?: string;
  country: string;
  paymentIntentId?: string;
  feeAmount?: number;
}

async function hmacSHA512(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  try {
    const data: BinancePayRequest = await req.json();
    const apiKey   = process.env.BINANCE_PAY_API_KEY   ?? "";
    const secretKey = process.env.BINANCE_PAY_SECRET_KEY ?? "";

    if (!apiKey || !secretKey) {
      return NextResponse.json({ error: "Binance Pay not configured" }, { status: 503 });
    }

    const nonce     = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const timestamp = Date.now();

    const payload = {
      env:            { terminalType: "APP" },
      merchantTradeNo: data.paymentIntentId ?? `OP${timestamp}`,
      orderAmount:    data.amount,
      currency:       (data.targetCurrency || data.currency).toUpperCase(),
      description:    "OmniPay Transfer",
      goodsDetails: [{
        goodsType:     "02",
        goodsCategory: "Z000",
        referenceGoodsId: nonce,
        goodsName:     "OmniPay",
        goodsUnitAmount: { currency: data.currency.toUpperCase(), amount: String(data.amount) },
      }],
      // Receiver wallet (Binance UID or email)
      receiver: {
        type:  "BINANCE_UID",
        value: data.bankToken,
        name:  data.receiverName ?? "",
      },
    };

    const bodyStr  = JSON.stringify(payload);
    const signData = `${timestamp}\n${nonce}\n${bodyStr}\n`;
    const signature = await hmacSHA512(signData, secretKey);

    const res = await fetch("https://bpay.binance.com/binancepay/openapi/v2/order", {
      method: "POST",
      headers: {
        "Content-Type":            "application/json",
        "BinancePay-Timestamp":    String(timestamp),
        "BinancePay-Nonce":        nonce,
        "BinancePay-Certificate-SN": apiKey,
        "BinancePay-Signature":    signature.toUpperCase(),
      },
      body: bodyStr,
    });

    const result = await res.json() as { status: string; data?: { prepayId: string; qrcodeLink: string } };

    if (result.status !== "SUCCESS") {
      throw new Error(`Binance Pay error: ${JSON.stringify(result)}`);
    }

    return NextResponse.json({
      tx_id:      result.data?.prepayId ?? nonce,
      status:     "pending",
      qr_url:     result.data?.qrcodeLink ?? "",
    });
  } catch (err) {
    console.error("Binance Pay error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Binance Pay error" },
      { status: 500 }
    );
  }
}
