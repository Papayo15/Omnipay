// GET /api/bridge/monitor
//
// Health check for Bridge.xyz API — used by Vercel Cron (daily at midnight).
// Also callable manually for ops visibility.
//
// Checks:
//   1. Bridge API reachability (GET /customers with limit=1)
//   2. Sandbox vs production mode
//   3. Sends WhatsApp alert if Bridge is unreachable
//
// Returns structured health report for the dashboard.

import { NextRequest, NextResponse } from "next/server";
import { bridgeRequest }             from "@/providers/bridge/client";
import { sendAdminWhatsApp }         from "@/lib/notify";

export const runtime = "edge";

export async function GET(req: NextRequest): Promise<Response> {
  // Protect with ADMIN_SECRET for direct calls (Vercel Cron bypasses this via internal header)
  const adminKey = req.headers.get("x-admin-secret") ?? req.nextUrl.searchParams.get("key");
  if (adminKey !== process.env.ADMIN_SECRET && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  const timestamp = new Date().toISOString();
  const checks: Array<{ name: string; status: "ok" | "error"; detail?: string }> = [];

  // Check 1: Bridge API reachability
  try {
    await bridgeRequest<unknown>("GET", "/customers?limit=1");
    checks.push({ name: "bridge_api", status: "ok" });
  } catch (e) {
    const msg = (e as Error).message;
    checks.push({ name: "bridge_api", status: "error", detail: msg });
    await sendAdminWhatsApp(
      `🚨 OmniPay — Bridge API INACCESIBLE\n${timestamp}\nError: ${msg}`,
    );
  }

  // Check 2: BRIDGE_WEBHOOK_SECRET configured
  checks.push({
    name:   "webhook_secret",
    status: process.env.BRIDGE_WEBHOOK_SECRET ? "ok" : "error",
    detail: process.env.BRIDGE_WEBHOOK_SECRET ? undefined : "BRIDGE_WEBHOOK_SECRET not set",
  });

  const allOk = checks.every((c) => c.status === "ok");

  return NextResponse.json({
    healthy:    allOk,
    timestamp,
    mode:       isSandbox ? "sandbox" : "production",
    api_base:   process.env.BRIDGE_API_BASE ?? "https://api.sandbox.bridge.xyz/v0",
    checks,
    // OmniPay fee summary (for ops visibility)
    fee_structure: {
      bridge_onramp:  "0.50%",
      bridge_offramp: "0.25%",
      bridge_total:   "0.75%",
      omnipay_service: "1.25%",
      omnipay_flat_p2p: "$0.99",
      omnipay_flat_b2b: "$1.99",
      kyc_surcharge:  "$2.00 (P2P first time)",
      kyb_surcharge:  "$10.00 (B2B first time)",
      total_to_sender: "~2.00% + flat",
      omnipay_net:    "~1.25% + flat per TX",
    },
  }, { status: allOk ? 200 : 503 });
}
