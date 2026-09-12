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

// These two are re-evaluated per-request so env var changes are picked up
// without relying on the module-level NATIVE_RAILS constant.
function getUsRail(): string {
  if (process.env.BRIDGE_USE_FEDNOW === "true") return "fednow";
  if (process.env.BRIDGE_USE_WIRE    === "true") return "wire";
  return "ach";
}

function getSepaRail(): string {
  return process.env.BRIDGE_USE_SEPA_INSTANT === "true" ? "sepa_instant" : "sepa";
}

const SEPA_COUNTRIES = new Set([
  "DE","FR","ES","IT","NL","PT","BE","AT","IE","FI","GR","CY","EE","LV","LT",
  "LU","MT","SK","SI","HR","SE","DK","NO","PL","CZ","HU","RO","BG","CH","IS",
  "LI","AD","MC","SM","XK","VA",
]);

export async function GET(req: NextRequest): Promise<Response> {
  const country = req.nextUrl.searchParams.get("country")?.toUpperCase() ?? "";
  const info    = NATIVE_RAILS[country];

  if (!info) {
    return NextResponse.json({ error: "Country not supported" }, { status: 404 });
  }

  // Override env-gated rails at request time
  let rail = info.rail;
  if (country === "US") {
    rail = getUsRail();
  } else if (SEPA_COUNTRIES.has(country)) {
    rail = getSepaRail();
  }

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
