// Server-side FX utility — safe for Edge and Node.js runtimes.
// Primary: Frankfurter (ECB data, updated daily, very reliable, free)
// Fallback: open.er-api (broader coverage, includes COP and other non-ECB currencies)

export async function fetchRatesFrom(baseCurrency: string): Promise<Record<string, number>> {
  const base = baseCurrency.toUpperCase();

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { rates?: Record<string, number> };
      if (data.rates && Object.keys(data.rates).length > 0) {
        return { [base]: 1, ...data.rates };
      }
    }
  } catch { /* fall through to backup */ }

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { rates?: Record<string, number> };
      return data.rates ?? {};
    }
  } catch { /* fall through */ }

  return {};
}

export async function getRate(from: string, to: string): Promise<number | null> {
  if (from.toUpperCase() === to.toUpperCase()) return 1;
  const rates = await fetchRatesFrom(from);
  return rates[to.toUpperCase()] ?? null;
}
