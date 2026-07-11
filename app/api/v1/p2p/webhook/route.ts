import { NextRequest, NextResponse } from "next/server";
import { executeBitsoSPEI, executeBitsoCard, calcP2PFee } from "@/lib/bitso";
import { executeWiseP2P, executeWiseCard } from "@/lib/wise-p2p";
import { selectP2PRail } from "@/lib/routing";
import { normalizeOnRamp, verifyOnRampSignature } from "@/lib/onramp";
import type { OnRampProvider } from "@/lib/onramp";
import { sendAdminWhatsApp } from "@/lib/notify";
import type { P2PToken } from "@/app/api/v1/p2p/checkout/route";

// POST /api/v1/p2p/webhook
//
// Provider-agnostic: receives Ramp Network OR Transak confirmation.
// Switch via NEXT_PUBLIC_ONRAMP_PROVIDER=ramp|transak
//
// On COMPLETED: decrypts token → dual routing:
//   LATAM (MX/BR/CO/AR) + BITSO_API_KEY → Bitso Business
//   Everything else OR Bitso fallback     → Wise Canada (same credentials as B2B)
//
// Card payouts: tries card rail first, falls back to bank if CARD_RAIL_UNAVAILABLE.
// Idempotent: duplicate partnerOrderId → Bitso/Wise rejects → return 200.

async function decryptP2PToken(token: string, secret: string): Promise<P2PToken | null> {
  try {
    const enc         = new TextEncoder();
    const combined    = Buffer.from(token, "base64url");
    const iv          = combined.subarray(0, 12);
    const ciphertext  = combined.subarray(12);
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(secret.slice(0, 32).padEnd(32, "0")),
      "AES-GCM", false, ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted)) as P2PToken;
  } catch { return null; }
}

async function settle(
  token:    P2PToken,
  usdcNet:  number,
  orderId:  string,
  isEmergency: boolean,
): Promise<string> {
  const {
    account, payout_method, nombre,
    target_country, target_currency,
  } = token;

  const rail = isEmergency ? "wise" : selectP2PRail(target_country);

  // ── Bitso route ──────────────────────────────────────────────────────────
  if (rail === "bitso") {
    const key    = process.env.BITSO_API_KEY!;
    const secret = process.env.BITSO_API_SECRET!;

    if (payout_method === "card") {
      try {
        return await executeBitsoCard(key, secret, account, nombre, usdcNet, orderId);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code !== "CARD_RAIL_UNAVAILABLE") throw err;
        // Card not supported → fall through to Wise card
      }
    } else {
      try {
        return await executeBitsoSPEI(key, secret, account, nombre, usdcNet, orderId);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "INVALID_CLABE") throw err; // permanent — no retry
        // Transient Bitso error → fall through to Wise
      }
    }
  }

  // ── Wise route (global or Bitso fallback) ────────────────────────────────
  const profileId = process.env.WISE_PROFILE_ID ?? "";
  const apiKey    = process.env.WISE_API_KEY    ?? "";
  if (!profileId || !apiKey) {
    throw new Error("Wise credentials not configured");
  }

  // USDC net → CAD (approx 1:1 via existing Wise CAD float — same as B2B pool)
  // In production: USDC arrives at Bitso → sold for CAD → deposited to Wise CAD balance.
  // For simplicity, 1 USDC ≈ 0.74 CAD (will be refined with live FX in production).
  const cadEquiv = usdcNet * 0.74;

  if (payout_method === "card") {
    try {
      return await executeWiseCard(profileId, apiKey, nombre, account, target_country, target_currency, cadEquiv, orderId);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "CARD_RAIL_UNAVAILABLE") {
        // Neither Bitso nor Wise supports card for this corridor — error out
        throw Object.assign(new Error("Card payout not available for this destination"), { code: "CARD_UNAVAILABLE" });
      }
      throw err;
    }
  }

  return await executeWiseP2P(profileId, apiKey, nombre, account, target_country, target_currency, cadEquiv, orderId);
}

export async function POST(req: NextRequest) {
  const bitsoKey  = process.env.BITSO_API_KEY;
  const linkSecret = process.env.LINK_SECRET ?? "dev-secret";
  const provider  = (process.env.NEXT_PUBLIC_ONRAMP_PROVIDER ?? "ramp") as OnRampProvider;

  const rawBody = await req.text();

  // Verify provider signature
  const valid = await verifyOnRampSignature(rawBody, req.headers, provider);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Normalize payload
  const tx = normalizeOnRamp(body, provider);

  if (tx.status !== "COMPLETED") {
    return NextResponse.json({ received: true, action: "none", status: tx.rawStatus });
  }

  if (!tx.partnerOrderId || !tx.usdcAmount) {
    console.error("[p2p/webhook] Missing partnerOrderId or usdcAmount", body);
    return NextResponse.json({ received: true });
  }

  // Decrypt token
  const token = await decryptP2PToken(tx.partnerOrderId, linkSecret);
  if (!token) {
    console.error("[p2p/webhook] Could not decrypt partnerOrderId");
    return NextResponse.json({ received: true }); // 200 to stop retries
  }

  const isEmergency    = !bitsoKey; // if no Bitso creds → force Wise
  const feeUsdc        = calcP2PFee(tx.usdcAmount, isEmergency);
  const usdcNet        = parseFloat((tx.usdcAmount - feeUsdc).toFixed(6));

  if (usdcNet <= 0) {
    console.error(`[p2p/webhook] Negative net USDC (${usdcNet}) for ${tx.partnerOrderId}`);
    return NextResponse.json({ received: true });
  }

  try {
    const txId = await settle(token, usdcNet, tx.partnerOrderId.slice(0, 20), isEmergency);
    const rail = isEmergency ? "wise_emergency" : selectP2PRail(token.target_country);

    sendAdminWhatsApp(
      `✅ OmniPay P2P\n${token.nombre} → ${token.amount_target.toLocaleString()} ${token.target_currency}\n` +
      `USDC neto: ${usdcNet} · Fee: $${feeUsdc.toFixed(2)}\nRail: ${rail} · ID: ${txId}`
    ).catch(() => {});

    return NextResponse.json({ received: true, txId, rail });

  } catch (err) {
    const e = err as Error & { code?: string };
    console.error("[p2p/webhook] settlement error:", e.message, e.code);

    const permanentCodes = ["INVALID_CLABE", "INVALID_ACCOUNT", "INVALID_CARD", "CARD_UNAVAILABLE"];

    if (permanentCodes.includes(e.code ?? "")) {
      sendAdminWhatsApp(
        `❌ OmniPay P2P — ${e.code}\n${token.nombre}\nAccount: ${token.account}\n` +
        `${token.amount_target} ${token.target_currency} · Review urgently`
      ).catch(() => {});
      return NextResponse.json({ received: true, error: e.message, code: e.code });
    }

    // Transient → 503 so provider retries
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
