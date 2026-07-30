// GET  /api/bridge/admin/fee-account  — check current fee account configured in Bridge
// POST /api/bridge/admin/fee-account  — configure fee account using Vercel env vars
//
// Required env vars (set in Vercel):
//   FEE_ACCOUNT_OWNER_NAME  — your legal name (e.g. "Juan Pablo García")
//   FEE_ROUTING_NUMBER      — Wise USA routing number (9 digits)
//   FEE_ACCOUNT_NUMBER      — Wise USA account number
//   FEE_BANK_NAME           — "Community Federal Savings Bank" (Wise's US bank)
//   FEE_STREET              — your address street
//   FEE_CITY                — city
//   FEE_STATE               — state (2 letters, e.g. "NY")
//   FEE_POSTAL_CODE         — postal code
//
// Protected by ADMIN_SECRET header — set ADMIN_SECRET in Vercel env vars.

import { NextRequest, NextResponse } from "next/server";
import { getFeeExternalAccount, configureFeeExternalAccount } from "@/providers/bridge/developer";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers.get("x-admin-secret") === secret;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getFeeExternalAccount();
  if (!account) {
    return NextResponse.json({
      configured: false,
      message:    "No fee external account configured yet. POST to this endpoint to configure.",
      env_check: {
        FEE_ACCOUNT_OWNER_NAME: !!process.env.FEE_ACCOUNT_OWNER_NAME,
        FEE_ROUTING_NUMBER:     !!process.env.FEE_ROUTING_NUMBER,
        FEE_ACCOUNT_NUMBER:     !!process.env.FEE_ACCOUNT_NUMBER,
        FEE_BANK_NAME:          !!process.env.FEE_BANK_NAME,
      },
    });
  }
  return NextResponse.json({
    configured:   true,
    id:           account.id,
    bank_name:    account.bank_name,
    owner_name:   account.account_owner_name,
    routing:      `****${account.account?.routing_number?.slice(-4)}`,
    account_last4: `****${account.account?.account_number?.slice(-4)}`,
    created_at:   account.created_at,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const account = await configureFeeExternalAccount();
    return NextResponse.json({
      ok:        true,
      message:   "Fee external account configured. Bridge will deposit your developer fees here.",
      id:        account.id,
      bank_name: account.bank_name,
      routing:   `****${account.account?.routing_number?.slice(-4)}`,
      account_last4: `****${account.account?.account_number?.slice(-4)}`,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: (err as Error).message,
    }, { status: 400 });
  }
}
