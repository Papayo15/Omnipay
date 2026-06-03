import { selectRail, type Rail } from "@/constants/rails";

export { selectRail };
export type { Rail };

// Airwallex JWT cache (module-level, válido ~30 min en edge runtime)
let _airwallexToken: string | null = null;
let _airwallexTokenExp = 0;

async function getAirwallexToken(): Promise<string> {
  if (_airwallexToken && Date.now() < _airwallexTokenExp) return _airwallexToken;
  const res = await fetch("https://api.airwallex.com/api/v1/authentication/login", {
    method: "POST",
    headers: {
      "x-client-id": process.env.AIRWALLEX_CLIENT_ID ?? "",
      "x-api-key": process.env.AIRWALLEX_API_KEY ?? "",
      "Content-Type": "application/json",
    },
  });
  const data = await res.json() as { token: string };
  _airwallexToken = data.token;
  _airwallexTokenExp = Date.now() + 28 * 60 * 1000;
  return _airwallexToken;
}

export function buildAuthHeaders(rail: Rail): Record<string, string> {
  switch (rail) {
    case "stripe":
      return {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };
    case "airwallex":
      return { "Content-Type": "application/json" };
    case "stablecoin":
      return { "Content-Type": "application/json" }; // Binance Pay uses HMAC per-request
    case "mercuryo":
      return { "Api-Key": process.env.MERCURYO_API_KEY ?? "", "Content-Type": "application/json" };
    case "belvo":
      return {
        Authorization: `Basic ${btoa(`${process.env.BELVO_SECRET_ID}:${process.env.BELVO_SECRET_PASSWORD}`)}`,
        "Content-Type": "application/json",
      };
    case "plaid":
      return {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
        "Content-Type": "application/json",
      };
    case "tink":
      return { Authorization: `Bearer ${process.env.TINK_ACCESS_TOKEN ?? ""}`, "Content-Type": "application/json" };
    case "alipay":
      return { "Content-Type": "application/json", "app-id": process.env.ALIPAY_APP_ID ?? "" };
    case "sbp":
      return { Authorization: `Bearer ${process.env.SBP_BRIDGE_API_KEY ?? ""}`, "Content-Type": "application/json" };
    case "dlocalgo":
      return { "X-Date": new Date().toISOString(), "X-Login": process.env.DLOCALGO_API_KEY ?? "", "Content-Type": "application/json" };
    default:
      return { "Content-Type": "application/json" };
  }
}

export { getAirwallexToken };

export function getBaseURL(rail: Rail): string {
  const isSandbox = process.env.NODE_ENV !== "production";
  switch (rail) {
    case "airwallex":
      return isSandbox ? "https://api-demo.airwallex.com" : "https://api.airwallex.com";
    case "stripe":
      return "https://api.stripe.com";
    case "stablecoin":
      return "https://bpay.binanceapi.com"; // Binance Pay
    case "mercuryo":
      return isSandbox ? "https://sandbox-api.mrcr.io" : "https://api.mercuryo.io";
    case "belvo":
      return isSandbox ? "https://sandbox.belvo.com" : "https://api.belvo.com";
    case "plaid":
      return isSandbox ? "https://sandbox.plaid.com" : "https://production.plaid.com";
    case "tink":
      return "https://api.tink.com";
    case "alipay":
      return isSandbox ? "https://openapi-sandbox.dl.alipaydev.com" : "https://openapi.alipay.com";
    case "sbp":
      return process.env.SBP_BRIDGE_ENDPOINT ?? "https://sbp-bridge.example.com";
    case "dlocalgo":
      return isSandbox ? "https://sandbox.dlocal.com" : "https://api.dlocal.com";
    default:
      return "";
  }
}

export function normalizeStatus(rail: Rail, data: Record<string, unknown>): { status: string; tx_id: string } {
  switch (rail) {
    case "flutterwave": {
      const s = String(data.status ?? "");
      return {
        tx_id: String(data.id ?? data.reference ?? ""),
        status: ["SUCCESSFUL","COMPLETE"].includes(s) ? "completed" : s === "FAILED" ? "failed" : "pending",
      };
    }
    case "airwallex": {
      const s = String(data.status ?? "");
      return {
        tx_id: String(data.transfer_id ?? data.id ?? ""),
        status: s === "COMPLETED" ? "completed" : s === "FAILED" ? "failed" : "pending",
      };
    }
    case "stripe": {
      const s = String(data.status ?? "");
      return {
        tx_id: String(data.id ?? ""),
        status: s === "succeeded" ? "completed" : s === "canceled" ? "failed" : "pending",
      };
    }
    case "mercuryo": {
      const s = String(data.status ?? "");
      return {
        tx_id: String(data.id ?? ""),
        status: s === "paid" || s === "order_scheduled" ? "completed" : s === "failed" || s === "cancelled" ? "failed" : "pending",
      };
    }
    case "belvo": {
      const s = String(data.status ?? "");
      return { tx_id: String(data.id ?? ""), status: s === "SUCCEEDED" ? "completed" : s === "FAILED" ? "failed" : "pending" };
    }
    case "plaid": {
      const t = data.transfer as Record<string, unknown> | undefined;
      const s = String(t?.status ?? "");
      return { tx_id: String(t?.id ?? ""), status: s === "settled" ? "completed" : s === "failed" ? "failed" : "pending" };
    }
    case "tink": {
      const s = String(data.status ?? "");
      return { tx_id: String(data.id ?? ""), status: s === "PAID" || s === "SETTLED" ? "completed" : s === "REJECTED" ? "failed" : "pending" };
    }
    case "alipay": {
      const s = String(data.trade_status ?? "");
      return { tx_id: String(data.trade_no ?? ""), status: s === "TRADE_SUCCESS" ? "completed" : s === "TRADE_CLOSED" ? "failed" : "pending" };
    }
    case "sbp":
    case "dlocalgo":
    case "stablecoin":
    default: {
      const s = String(data.status ?? "");
      return {
        tx_id: String(data.id ?? data.tx_id ?? ""),
        status: ["completed", "settled", "paid"].includes(s) ? "completed"
          : ["failed", "rejected", "error"].includes(s) ? "failed"
          : "pending",
      };
    }
  }
}
