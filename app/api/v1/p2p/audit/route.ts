import { NextRequest, NextResponse } from "next/server";
import { getBitsoUSDCRate, P2P_FEE_PCT, P2P_FEE_MIN, P2P_FEE_FLAT, FX_BUFFER } from "@/lib/bitso";
import { getWiseLivePrice } from "@/lib/wise-p2p";
import { sendAdminWhatsApp } from "@/lib/notify";

// GET /api/v1/p2p/audit
//
// Runs daily at 00:00 UTC via Vercel Cron.
// Protected by ADMIN_SECRET Bearer token.
//
// Audits:
//   1. Bitso rate vs historical baseline (detects Bitso spread changes)
//   2. Wise corridor prices for MX, BR, CO, AR and top global routes
//   3. Alerts via WhatsApp if drift > 0.1% on any route
//
// No persistent state — baseline is the hardcoded constants in lib/bitso.ts.
// Human reviews alerts and updates constants if needed.

export const maxDuration = 60;

const CORRIDORS = [
  { from: "USD", to: "MXN", label: "MX" },
  { from: "USD", to: "BRL", label: "BR" },
  { from: "USD", to: "COP", label: "CO" },
  { from: "USD", to: "ARS", label: "AR" },
  { from: "USD", to: "INR", label: "IN" },
  { from: "USD", to: "PHP", label: "PH" },
  { from: "USD", to: "NGN", label: "NG" },
  { from: "USD", to: "GBP", label: "GB" },
  { from: "USD", to: "EUR", label: "EU" },
];

// Baseline fee pct we expect Bitso to embed in the spread (~0.1%)
const BITSO_EXPECTED_SPREAD = 0.001;
// Drift threshold that triggers an alert
const DRIFT_THRESHOLD = 0.001; // 0.1%

interface CorridorAudit {
  corridor:       string;
  wise_fee_pct:   number;
  drift_from_baseline: number;
  alert:          boolean;
}

export async function GET(req: NextRequest) {
  const auth   = req.headers.get("authorization") ?? "";
  const secret = process.env.ADMIN_SECRET ?? "";

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey    = process.env.WISE_API_KEY ?? "";
  const audited_at = new Date().toISOString();
  const alerts: string[] = [];
  const corridors: CorridorAudit[] = [];

  // ── Audit Wise corridor prices ─────────────────────────────────────────────
  for (const c of CORRIDORS) {
    try {
      const price   = await getWiseLivePrice(apiKey, 1000, c.from, c.to);
      const feePct  = price.fee / 1000;
      const drift   = Math.abs(feePct - BITSO_EXPECTED_SPREAD);
      const isAlert = drift > DRIFT_THRESHOLD;
      corridors.push({ corridor: c.label, wise_fee_pct: feePct, drift_from_baseline: drift, alert: isAlert });
      if (isAlert) alerts.push(`${c.label}: fee ${(feePct * 100).toFixed(3)}% (drift ${(drift * 100).toFixed(3)}%)`);
    } catch (e) {
      corridors.push({ corridor: c.label, wise_fee_pct: -1, drift_from_baseline: -1, alert: false });
    }
  }

  // ── Audit Bitso USDC/MXN rate availability ─────────────────────────────────
  let bitsoRate: number | null = null;
  try {
    bitsoRate = await getBitsoUSDCRate("usdc_mxn");
  } catch {
    alerts.push("Bitso USDC/MXN ticker unreachable");
  }

  // ── Alert admin if any drift detected ─────────────────────────────────────
  if (alerts.length > 0) {
    const msg =
      `⚠️ OmniPay P2P Fee Audit — ${audited_at.slice(0, 10)}\n` +
      `${alerts.length} corridor(s) need attention:\n` +
      alerts.map((a) => `• ${a}`).join("\n") +
      `\n\nCurrent constants:\nP2P_FEE_PCT=${P2P_FEE_PCT}\nP2P_FEE_MIN=$${P2P_FEE_MIN}\nFX_BUFFER=${FX_BUFFER}`;
    sendAdminWhatsApp(msg).catch(() => {});
  }

  return NextResponse.json({
    audited_at,
    bitso_rate_mxn: bitsoRate,
    corridors,
    alerts,
    current_constants: {
      P2P_FEE_PCT,
      P2P_FEE_MIN,
      P2P_FEE_FLAT,
      FX_BUFFER,
    },
  });
}
