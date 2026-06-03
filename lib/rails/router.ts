import { selectRail, type Rail } from "@/constants/rails";

export { selectRail };
export type { Rail };

// Airwallex JWT cache (module-level, válido ~30 min en edge runtime)
let _airwallexToken: string | null = null;
let _airwallexTokenExp = 0;

export async function getAirwallexToken(): Promise<string> {
  if (_airwallexToken && Date.now() < _airwallexTokenExp) return _airwallexToken;
  const res = await fetch("https://api.airwallex.com/api/v1/authentication/login", {
    method: "POST",
    headers: {
      "x-client-id": process.env.AIRWALLEX_CLIENT_ID ?? "",
      "x-api-key":   process.env.AIRWALLEX_API_KEY   ?? "",
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
    case "visa_direct":
      return {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };
    case "wise":
      return {
        Authorization: `Bearer ${process.env.WISE_API_TOKEN ?? ""}`,
        "Content-Type": "application/json",
      };
    case "airwallex":
      return { "Content-Type": "application/json" }; // token via getAirwallexToken()
    case "binance_pay":
      return { "Content-Type": "application/json" }; // HMAC-SHA512 per-request
    default:
      return { "Content-Type": "application/json" };
  }
}

export function getBaseURL(rail: Rail): string {
  const isSandbox = process.env.NODE_ENV !== "production";
  switch (rail) {
    case "airwallex":
      return isSandbox ? "https://api-demo.airwallex.com" : "https://api.airwallex.com";
    case "stripe":
    case "visa_direct":
      return "https://api.stripe.com";
    case "wise":
      return "https://api.transferwise.com";
    case "binance_pay":
      return "https://bpay.binance.com";
    default:
      return "";
  }
}

export function normalizeStatus(rail: Rail, data: Record<string, unknown>): { status: string; tx_id: string } {
  switch (rail) {
    case "airwallex": {
      const s = String(data.status ?? "");
      return {
        tx_id:  String(data.transfer_id ?? data.id ?? ""),
        status: s === "COMPLETED" ? "completed" : s === "FAILED" ? "failed" : "pending",
      };
    }
    case "stripe":
    case "visa_direct": {
      const s = String(data.status ?? "");
      return {
        tx_id:  String(data.id ?? ""),
        status: s === "succeeded" || s === "paid" ? "completed" : s === "canceled" || s === "failed" ? "failed" : "pending",
      };
    }
    case "wise": {
      const s = String(data.status ?? "");
      return {
        tx_id:  String(data.id ?? data.transfer_id ?? ""),
        status: s === "outgoing_payment_sent" ? "completed" : s === "funds_refunded" || s === "cancelled" ? "failed" : "pending",
      };
    }
    default: {
      const s = String(data.status ?? "");
      return {
        tx_id:  String(data.id ?? data.tx_id ?? ""),
        status: ["completed", "settled", "paid", "SUCCESS"].includes(s) ? "completed"
          : ["failed", "rejected", "error", "FAILED"].includes(s) ? "failed"
          : "pending",
      };
    }
  }
}
