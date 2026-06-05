import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPaysendBalance } from "@/lib/paysend";

// GET /api/admin/stats
// Panel de reconciliación operacional. Protegido con Bearer token.
// Uso: curl https://<domain>/api/admin/stats -H "Authorization: Bearer $ADMIN_SECRET"

const WISE_MIN_BALANCE_CAD = 500; // Alerta si el buffer baja de este umbral

interface WiseBalance {
  currency: string;
  amount: { value: number };
}

interface WiseTransfer {
  id: number;
  status: string;
  targetAmount: number;
  targetCurrency: string;
  sourceAmount: number;
  created: string;
}

async function getWiseBalances(profileId: string, apiKey: string) {
  try {
    const res = await fetch(
      `https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return await res.json() as WiseBalance[];
  } catch { return []; }
}

async function getWiseRecentTransfers(profileId: string, apiKey: string, limit = 10) {
  try {
    const res = await fetch(
      `https://api.wise.com/v1/transfers?profile=${profileId}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return await res.json() as WiseTransfer[];
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const auth   = req.headers.get("authorization") ?? "";
  const secret = process.env.ADMIN_SECRET ?? "";

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeKey   = process.env.STRIPE_SECRET_KEY  ?? "";
  const wiseKey     = process.env.WISE_API_KEY        ?? "";
  const wiseProfile = process.env.WISE_PROFILE_ID     ?? "";
  const paysendKey  = process.env.PAYSEND_API_KEY     ?? "";

  const [stripeBalance, wiseBalances, wiseTransfers, paysendCAD] = await Promise.allSettled([
    new Stripe(stripeKey).balance.retrieve(),
    getWiseBalances(wiseProfile, wiseKey),
    getWiseRecentTransfers(wiseProfile, wiseKey),
    getPaysendBalance(paysendKey),
  ]);

  const stripe = stripeBalance.status === "fulfilled" ? stripeBalance.value : null;
  const wise   = wiseBalances.status  === "fulfilled" ? wiseBalances.value  : [];
  const txs    = wiseTransfers.status === "fulfilled" ? wiseTransfers.value : [];
  const paysendBal = paysendCAD.status === "fulfilled" ? paysendCAD.value : 0;

  const stripeAvailableCAD = stripe?.available
    .filter((b) => b.currency === "cad")
    .reduce((s, b) => s + b.amount / 100, 0) ?? 0;

  const stripePendingCAD = stripe?.pending
    .filter((b) => b.currency === "cad")
    .reduce((s, b) => s + b.amount / 100, 0) ?? 0;

  const wiseCAD = wise.find((b) => b.currency === "CAD")?.amount?.value ?? 0;
  const wiseUSD = wise.find((b) => b.currency === "USD")?.amount?.value ?? 0;

  return NextResponse.json({
    stripe: {
      available_cad: stripeAvailableCAD,
      pending_cad:   stripePendingCAD,
    },
    paysend: {
      balance_cad: paysendBal,
    },
    wise: {
      balance_cad: wiseCAD,
      balance_usd: wiseUSD,
    },
    wise_recent_transfers: txs.slice(0, 10).map((t) => ({
      id:       t.id,
      status:   t.status,
      amount:   t.targetAmount,
      currency: t.targetCurrency,
      cad_sent: t.sourceAmount,
      created:  t.created,
    })),
    health: {
      wise_buffer_ok:        wiseCAD >= WISE_MIN_BALANCE_CAD,
      paysend_buffer_ok:     paysendBal >= WISE_MIN_BALANCE_CAD,
      stripe_payout_eligible: stripeAvailableCAD > 0,
    },
    timestamp: new Date().toISOString(),
  });
}
