// GET /api/alchemypay/status
//
// Tells the frontend whether Alchemy Pay's on-ramp is actually usable right
// now, without ever exposing the credentials themselves. The moment
// ALCHEMYPAY_APP_ID / ALCHEMYPAY_APP_SECRET are set in Vercel and the app
// redeploys, this flips to enabled: true and the "Pay with Alchemy Pay"
// option appears in /pagar on its own — no other config needed.
//
// Off-ramp stays separate and unreported here — it's gated behind
// BRIDGE_ONCHAIN_TRANSFERS_ENABLED (see /api/alchemypay/offramp/create),
// blocked until Bridge enables outbound on-chain transfers on the account.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const onrampEnabled = Boolean(process.env.ALCHEMYPAY_APP_ID && process.env.ALCHEMYPAY_APP_SECRET);
  return NextResponse.json({ onrampEnabled });
}
