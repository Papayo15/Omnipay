import { NextRequest, NextResponse } from "next/server";
import { selectRemesaRail } from "@/constants/remesa-rails";

export const runtime = "edge";

// POST /api/remesa
// Enruta la transferencia al proveedor correcto según el país destino:
//   Airwallex → USA, Canadá, Europa, LATAM
//   Thunes    → Asia, África (wallets móviles, bancos locales)
//   Bridge    → Rusia y mercados restringidos (stablecoin bridge)
//
// OmniPay no toca el dinero — delega a infraestructura licenciada.

interface RemesaRequest {
  amount: number;
  sourceCurrency: string;
  targetCountry: string;
  recipientName: string;
  recipientPhone?: string;
  recipientAccount?: string;
  senderPhone?: string;
}

// ── Airwallex ──────────────────────────────────────────────────────
async function sendViaAirwallex(data: RemesaRequest) {
  const clientId = process.env.AIRWALLEX_CLIENT_ID ?? "";
  const apiKey   = process.env.AIRWALLEX_API_KEY   ?? "";
  if (!clientId || !apiKey) throw new Error("Airwallex not configured");

  // 1. Auth
  const authRes = await fetch("https://api.airwallex.com/api/v1/authentication/login", {
    method: "POST",
    headers: { "x-client-id": clientId, "x-api-key": apiKey, "Content-Type": "application/json" },
  });
  if (!authRes.ok) throw new Error("Airwallex auth failed");
  const { token } = await authRes.json() as { token: string };

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const requestId = crypto.randomUUID();

  // 2. Create transfer
  const createRes = await fetch("https://api.airwallex.com/api/v1/transfers/create", {
    method: "POST",
    headers,
    body: JSON.stringify({
      request_id: requestId,
      source_currency: data.sourceCurrency,
      payment_currency: data.sourceCurrency, // Airwallex converts automatically
      amount: data.amount,
      payment_method: data.recipientPhone ? "ALIPAY" : "LOCAL",
      beneficiary: {
        bank_details: {
          account_name:   data.recipientName,
          account_number: data.recipientAccount ?? data.recipientPhone,
          bank_country_code: data.targetCountry,
        },
      },
    }),
  });
  if (!createRes.ok) throw new Error(`Airwallex create: ${await createRes.text()}`);
  const created = await createRes.json() as { id: string };

  // 3. Submit
  await fetch(`https://api.airwallex.com/api/v1/transfers/${created.id}/submit`, {
    method: "POST", headers,
  });

  return { tx_id: created.id, status: "pending", rail: "airwallex" };
}

// ── Thunes ────────────────────────────────────────────────────────
async function sendViaThunes(data: RemesaRequest) {
  const clientId = process.env.THUNES_CLIENT_ID ?? "";
  const secret   = process.env.THUNES_SECRET    ?? "";
  if (!clientId || !secret) throw new Error("Thunes not configured");

  const auth = btoa(`${clientId}:${secret}`);
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };

  const res = await fetch("https://api.thunes.com/v2/money-transfer/transactions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      external_id: crypto.randomUUID(),
      payer: { country: "CA", currency: data.sourceCurrency },
      beneficiary: {
        country: data.targetCountry,
        first_name: data.recipientName.split(" ")[0],
        last_name:  data.recipientName.split(" ").slice(1).join(" ") || data.recipientName,
        msisdn: data.recipientPhone ?? "",
        account_number: data.recipientAccount ?? "",
      },
      requested_amount: data.amount,
      requested_currency: data.sourceCurrency,
      service: { id: 1 }, // ID de servicio Thunes (se configura por corredor)
    }),
  });

  if (!res.ok) throw new Error(`Thunes: ${await res.text()}`);
  const result = await res.json() as { id: number; status: string };
  return { tx_id: String(result.id), status: result.status ?? "pending", rail: "thunes" };
}

// ── Bridge.xyz (stablecoin) ────────────────────────────────────────
async function sendViaBridge(data: RemesaRequest) {
  const apiKey = process.env.BRIDGE_API_KEY ?? "";
  if (!apiKey) throw new Error("Bridge not configured");

  const res = await fetch("https://api.bridge.xyz/v0/transfers", {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount:   String(data.amount),
      currency: data.sourceCurrency.toLowerCase(),
      source: { payment_rail: "crypto", currency: "usdc" },
      destination: {
        payment_rail: "crypto",
        currency: "usdc",
        to_address: data.recipientAccount ?? data.recipientPhone,
      },
      on_behalf_of: data.recipientName,
    }),
  });

  if (!res.ok) throw new Error(`Bridge: ${await res.text()}`);
  const result = await res.json() as { id: string; state: string };
  return { tx_id: result.id, status: result.state ?? "pending", rail: "bridge" };
}

export async function POST(req: NextRequest) {
  try {
    const data: RemesaRequest = await req.json();

    if (!data.amount || data.amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (!data.targetCountry) {
      return NextResponse.json({ error: "Target country required" }, { status: 400 });
    }

    const rail = selectRemesaRail(data.targetCountry);

    let result: { tx_id: string; status: string; rail: string };
    switch (rail) {
      case "thunes":    result = await sendViaThunes(data);    break;
      case "bridge":    result = await sendViaBridge(data);    break;
      default:          result = await sendViaAirwallex(data); break;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Remesa error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transfer error" },
      { status: 500 }
    );
  }
}
