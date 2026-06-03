"use client";

// FX rates via open.er-api.com — gratuito, sin API key, actualizado cada hora
// Cache en memoria por 5 minutos para no over-llamar

interface CacheEntry {
  rate: number;
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const cache = new Map<string, CacheEntry>();

export async function getFXRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;

  const key = `${from}_${to}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) return cached.rate;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { rates: Record<string, number> };
    const rate = data.rates[to];
    if (!rate) return null;
    cache.set(key, { rate, ts: now });
    return rate;
  } catch {
    return null;
  }
}

// Formatea el tipo de cambio para display
export function formatRate(rate: number): string {
  return rate >= 1 ? rate.toFixed(2) : rate.toFixed(4);
}
