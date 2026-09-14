// GET /api/bridge/rail-info?country=MX
//
// Returns the active destination rail and ETA i18n key for a given country.
// Env vars are read at request time (not module load) so Vercel env changes
// take effect immediately after redeploy without needing to restart.

import { NextRequest, NextResponse } from "next/server";
import { NATIVE_RAILS } from "@/providers/bridge/liquidation";

export const dynamic = "force-dynamic";

const RAIL_ETA_KEY: Record<string, string> = {
  ach:          "eta_ach",
  ach_same_day: "eta_ach_same_day",
  wire:         "eta_wire",
  fednow:       "eta_fednow",
  spei:         "eta_spei",
  pix:          "eta_pix",
  sepa:         "eta_sepa",
  sepa_instant: "eta_sepa_instant",
  fps:          "eta_fps",
  cop:          "eta_cop",
};

// getUsRail is re-evaluated per-request so env var changes take effect after redeploy.
// FedNow offramps are invite-only beta at Bridge — only enable once beta access is confirmed.
function getUsRail(): string {
  if (process.env.BRIDGE_USE_FEDNOW === "true") return "fednow";
  if (process.env.BRIDGE_USE_WIRE    === "true") return "wire";
  return "ach";
}

export async function GET(req: NextRequest): Promise<Response> {
  const country = req.nextUrl.searchParams.get("country")?.toUpperCase() ?? "";
  const info    = NATIVE_RAILS[country];

  if (!info) {
    return NextResponse.json({ error: "Country not supported" }, { status: 404 });
  }

  // US rail is env-gated (fednow/wire/ach). SEPA Instant is automatic on Bridge's side —
  // no separate rail to set; always send "sepa" and Bridge picks the fastest path.
  const rail = country === "US" ? getUsRail() : info.rail;

  return NextResponse.json({
    country,
    rail,
    currency: info.currency,
    label:    info.label,
    eta_key:  RAIL_ETA_KEY[rail] ?? "eta_ach",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
