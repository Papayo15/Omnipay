// GET /api/bridge/rail-info?country=MX
//
// Returns the active destination rail and ETA i18n key for a given country.
// Respects BRIDGE_USE_FEDNOW, BRIDGE_USE_WIRE, BRIDGE_USE_SEPA_INSTANT env vars
// so the client-side form hint reflects the actual configured rail.

import { NextRequest, NextResponse } from "next/server";
import { NATIVE_RAILS } from "@/providers/bridge/liquidation";

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

export async function GET(req: NextRequest): Promise<Response> {
  const country = req.nextUrl.searchParams.get("country")?.toUpperCase() ?? "";
  const info = NATIVE_RAILS[country];
  if (!info) {
    return NextResponse.json({ error: "Country not supported" }, { status: 404 });
  }
  return NextResponse.json({
    country,
    rail:     info.rail,
    currency: info.currency,
    label:    info.label,
    eta_key:  RAIL_ETA_KEY[info.rail] ?? "eta_ach",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
