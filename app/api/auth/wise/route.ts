export const runtime = "edge";

// Wise auth endpoint retired — Wise rail permanently removed.
export async function GET() {
  return Response.json({ ok: false, error: "Wise rail retired" }, { status: 503 });
}
