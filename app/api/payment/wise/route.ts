export const runtime = "edge";

// Wise rail permanently retired.
// Replaced by: Stripe (Occidente + LATAM), Airwallex (Asia), Binance Pay (restricted).
export async function POST() {
  return Response.json(
    { error: "Wise rail retired — use stripe, airwallex, or stablecoin" },
    { status: 503 }
  );
}
