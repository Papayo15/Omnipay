// Wise Business — P2P Disbursement
//
// Uses the SAME credentials as B2B: WISE_API_KEY + WISE_PROFILE_ID
// Called from the P2P webhook as a global route or Bitso fallback.
//
// Flow: USDC arrives at Bitso → sold for CAD → already in Wise CAD balance
//       OR: OmniPay CAD float in Wise is used directly (same as B2B)
//       Wise then executes local transfer in the destination currency.

import { getWiseAccountType, buildWiseAccountDetails } from "@/lib/wise-accounts";

const WISE_BASE = "https://api.wise.com";

function wiseHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization:  `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// ── Create recipient account ──────────────────────────────────────────────────

async function createWiseAccount(
  profileId:  string,
  apiKey:     string,
  nombre:     string,
  account:    string,
  country:    string,
  currency:   string,
): Promise<number> {
  const res = await fetch(`${WISE_BASE}/v1/accounts`, {
    method: "POST",
    headers: wiseHeaders(apiKey),
    body: JSON.stringify({
      profile:           profileId,
      accountHolderName: nombre,
      currency,
      type:              getWiseAccountType(country),
      details:           buildWiseAccountDetails(country, account),
    }),
  });
  const data = await res.json() as { id?: number; errors?: Array<{ message: string }> };
  if (!res.ok || !data.id) {
    const msg = data.errors?.[0]?.message ?? String(res.status);
    if (res.status === 422) throw Object.assign(new Error(msg), { code: "INVALID_ACCOUNT" });
    throw new Error(`Wise account: ${msg}`);
  }
  return data.id;
}

// ── Get live Wise price (for fee transparency) ────────────────────────────────

export async function getWiseLivePrice(
  apiKey:         string,
  sourceAmount:   number,
  sourceCurrency: string,
  targetCurrency: string,
): Promise<{ fee: number; rate: number; targetAmount: number }> {
  try {
    const res = await fetch(
      `${WISE_BASE}/v1/rates?source=${sourceCurrency}&target=${targetCurrency}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
    );
    if (res.ok) {
      const data = await res.json() as Array<{ rate: number }>;
      const rate = data[0]?.rate ?? 0;
      if (rate) {
        return {
          fee:          sourceAmount * 0.004, // Wise typical ~0.4% spread
          rate,
          targetAmount: sourceAmount * rate,
        };
      }
    }
  } catch { /* fall through to fallback */ }

  // Fallback: open.er-api (already in CSP)
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${sourceCurrency}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const data = await res.json() as { rates: Record<string, number> };
      const rate = data.rates[targetCurrency] ?? 0;
      if (rate) {
        return { fee: sourceAmount * 0.004, rate, targetAmount: sourceAmount * rate };
      }
    }
  } catch { /* ignore */ }

  return { fee: sourceAmount * 0.005, rate: 0, targetAmount: 0 };
}

// ── Execute Wise transfer (bank account) ──────────────────────────────────────

export async function executeWiseP2P(
  profileId:    string,
  apiKey:       string,
  nombre:       string,
  account:      string,     // CLABE / IBAN / ACH / etc.
  targetCountry: string,
  targetCurrency: string,
  sourceAmountCAD: number,  // CAD from Wise float (same pool as B2B)
  reference:    string,
): Promise<string> {
  const headers = wiseHeaders(apiKey);

  const accountId = await createWiseAccount(profileId, apiKey, nombre, account, targetCountry, targetCurrency);

  const quoteRes = await fetch(`${WISE_BASE}/v3/profiles/${profileId}/quotes`, {
    method: "POST", headers,
    body: JSON.stringify({ sourceCurrency: "CAD", targetCurrency, sourceAmount: sourceAmountCAD }),
  });
  const quote = await quoteRes.json() as { id?: string; errors?: Array<{ message: string }> };
  if (!quoteRes.ok || !quote.id) {
    const msg = quote.errors?.[0]?.message ?? String(quoteRes.status);
    if (quoteRes.status === 422) throw Object.assign(new Error(msg), { code: "CURRENCY_UNSUPPORTED" });
    throw new Error(`Wise quote: ${msg}`);
  }

  const transferRef = `OP-P2P|${reference}`.slice(0, 50);
  const transferRes = await fetch(`${WISE_BASE}/v1/transfers`, {
    method: "POST", headers,
    body: JSON.stringify({
      targetAccount:         accountId,
      quoteUuid:             quote.id,
      customerTransactionId: crypto.randomUUID(),
      details: { reference: transferRef },
    }),
  });
  const transfer = await transferRes.json() as { id?: number; errors?: Array<{ message: string }> };
  if (!transferRes.ok || !transfer.id) {
    throw new Error(`Wise transfer: ${transfer.errors?.[0]?.message ?? transferRes.status}`);
  }

  const fundRes = await fetch(
    `${WISE_BASE}/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
    { method: "POST", headers, body: JSON.stringify({ type: "BALANCE" }) },
  );
  if (!fundRes.ok) {
    const e = await fundRes.json() as { errors?: Array<{ message: string }> };
    const msg = e.errors?.[0]?.message ?? String(fundRes.status);
    if (fundRes.status === 422) throw Object.assign(new Error(msg), { code: "INSUFFICIENT_FUNDS" });
    throw new Error(`Wise fund: ${msg}`);
  }

  return String(transfer.id);
}

// ── Execute Wise card payout (Visa Direct / MC Send) ─────────────────────────
// Wise Business accounts with Visa Direct enabled can push to 16-digit debit cards.
// If card rail is unavailable for the destination country, falls back to bank transfer.

export async function executeWiseCard(
  profileId:       string,
  apiKey:          string,
  nombre:          string,
  cardNumber:      string,  // 16-digit Visa/MC
  targetCountry:   string,
  targetCurrency:  string,
  sourceAmountCAD: number,
  reference:       string,
): Promise<string> {
  const headers = wiseHeaders(apiKey);

  // Attempt card-to-card via Wise tenders endpoint
  const tenderRes = await fetch(`${WISE_BASE}/v3/profiles/${profileId}/tenders`, {
    method: "POST", headers,
    body: JSON.stringify({
      type:             "CARD",
      cardNumber,
      holderName:       nombre,
      targetCurrency,
      targetCountry,
      sourceCurrency:   "CAD",
      sourceAmount:     sourceAmountCAD,
      reference:        `OP-P2P|${reference}`.slice(0, 50),
      idempotenceUuid:  crypto.randomUUID(),
    }),
  });

  if (tenderRes.ok) {
    const tender = await tenderRes.json() as { id?: string };
    if (tender.id) return tender.id;
  }

  // Card rail not available → fallback to bank transfer
  // (requires the caller to have a bank account on file; cards with no bank → throw)
  const status = tenderRes.status;
  if (status === 422 || status === 400) {
    throw Object.assign(new Error("Card rail unavailable for this destination"), { code: "CARD_RAIL_UNAVAILABLE" });
  }

  throw new Error(`Wise card tender: ${tenderRes.status}`);
}
