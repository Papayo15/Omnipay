"use client";

// FX rates — Frankfurter (ECB) as primary, open.er-api as fallback.
// Frankfurter is more reliable and less prone to stale data; open.er-api covers
// non-ECB currencies like COP that Frankfurter may not include.
// Cache: 10 minutes client-side to avoid excessive requests.

interface CacheEntry {
  rate: number;
  ts: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const cache = new Map<string, CacheEntry>();

export async function getFXRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;

  const key = `${from}_${to}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) return cached.rate;

  const store = (rate: number) => { cache.set(key, { rate, ts: now }); return rate; };

  // Primary: Frankfurter (ECB data)
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from.toUpperCase()}&to=${to.toUpperCase()}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const data = await res.json() as { rates: Record<string, number> };
      const rate = data.rates?.[to.toUpperCase()];
      if (rate) return store(rate);
    }
  } catch { /* fall through */ }

  // Fallback: open.er-api (broader currency coverage)
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json() as { rates: Record<string, number> };
      const rate = data.rates?.[to.toUpperCase()];
      if (rate) return store(rate);
    }
  } catch { /* fall through */ }

  return null;
}

// Formatea el tipo de cambio para display
export function formatRate(rate: number): string {
  return rate >= 1 ? rate.toFixed(2) : rate.toFixed(4);
}
