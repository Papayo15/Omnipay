// POST /api/alchemypay/webhook
//
// Single endpoint for all Alchemy Pay async notifications: on-ramp order status,
// off-ramp order status, and KYC completion (registered as `callbackUrl` in the
// respective create-order / KYC-registration calls). Verifies the HMAC signature,
// dedups by orderNo/userNo, and advances the matching OrderRecord.
//
// On-ramp webhook only fires for PAY_FAIL / PAY_SUCCESS / FINISHED.
// Off-ramp webhook covers the full lifecycle (see OffRampStatusCode).
// KYC webhook fires once per registerKyc() call, with kycStatus COMPLETED/REJECTED.

import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { verifyAlchemyPayWebhook } from "@/providers/alchemypay/webhooks";
import { updateOrder, getOrderAsync } from "@/lib/order-state";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/alchemypay/webhook";

const processedFallback = new Set<string>();

async function markProcessed(eventKey: string): Promise<boolean> {
  if (process.env.REDIS_URL) {
    try {
      const redis = await getRedis();
      const result = await redis.set(`wh:alchemypay:${eventKey}`, "1", { NX: true, EX: 86400 });
      return result === "OK";
    } catch (e) {
      console.error("[alchemypay/webhook] Redis error:", (e as Error).message);
    }
  }
  if (processedFallback.has(eventKey)) return false;
  processedFallback.add(eventKey);
  if (processedFallback.size > 5000) {
    const first = processedFallback.values().next().value;
    if (first) processedFallback.delete(first);
  }
  return true;
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const timestampHeader = req.headers.get("timestamp");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let valid: boolean;
  try {
    valid = await verifyAlchemyPayWebhook(WEBHOOK_PATH, timestampHeader, payload);
  } catch (e) {
    console.error("[alchemypay/webhook] verification error:", e);
    return NextResponse.json({ error: "Verification error" }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── KYC completion callback ────────────────────────────────────────────
  if (typeof payload.kycStatus === "string") {
    const eventKey = `kyc-${payload.userNo}-${payload.kycStatus}`;
    if (!(await markProcessed(eventKey))) {
      return NextResponse.json({ success: true, dedup: true });
    }
    // No local KYC-status table (zero-data architecture) — the merchantUserId /
    // order that triggered this KYC flow should re-check via queryKycStatus()
    // or rely on this webhook having fired as the completion signal.
    console.log(`[alchemypay/webhook] KYC ${payload.kycStatus} for userNo=${payload.userNo}`);
    return NextResponse.json({ success: true });
  }

  const merchantOrderNo = String(payload.merchantOrderNo ?? "");
  if (!merchantOrderNo) {
    return NextResponse.json({ error: "Missing merchantOrderNo" }, { status: 400 });
  }

  const status = String(payload.status ?? "");
  const eventKey = `${merchantOrderNo}-${status}`;
  if (!(await markProcessed(eventKey))) {
    return NextResponse.json({ success: true, dedup: true });
  }

  const order = await getOrderAsync(merchantOrderNo);
  if (!order) {
    console.warn(`[alchemypay/webhook] Unknown order ${merchantOrderNo}`);
    return NextResponse.json({ success: true });
  }

  // ── On-ramp events: PAY_FAIL | PAY_SUCCESS | FINISHED ──────────────────
  if (["PAY_FAIL", "PAY_SUCCESS", "FINISHED"].includes(status)) {
    if (status === "PAY_FAIL") {
      updateOrder(merchantOrderNo, { status: "FAILED", errorMessage: "Alchemy Pay on-ramp payment failed" });
    } else if (status === "PAY_SUCCESS") {
      // Early signal — fiat cleared, USDC is on its way to the liquidation address.
      // Bridge's own webhook still confirms on-chain arrival and drives LIQUIDATING_FIAT.
      updateOrder(merchantOrderNo, { status: "PROCESSING_ONCHAIN" });
    }
    // FINISHED: USDC delivered — no local transition needed, Bridge's webhook takes over.
    return NextResponse.json({ success: true });
  }

  // ── Off-ramp events: numeric status codes 1–7 (see offramp.ts) ─────────
  if (status === "4") {
    updateOrder(merchantOrderNo, { status: "COMPLETED", completedAt: Date.now() });
  } else if (["5", "6", "7"].includes(status)) {
    const reason = { "5": "payment failed", "6": "refunded", "7": "order expired" }[status];
    updateOrder(merchantOrderNo, { status: "FAILED", errorMessage: `Alchemy Pay off-ramp: ${reason}` });
  }
  // 1 (created) / 2 (USDC received) / 3 (fiat payout started): already LIQUIDATING_FIAT, no-op.

  return NextResponse.json({ success: true });
}
