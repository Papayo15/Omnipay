// Conduit API base HTTP client
// Auth: x-api-key header  |  Idempotency: idempotency-key header on POST/PATCH
// Lazy env resolution — avoids blowing up next build page-data collection.

function getBase(): string {
  const b = process.env.CONDUIT_API_BASE;
  if (!b && process.env.NODE_ENV === "production") {
    throw new Error("CONDUIT_API_BASE must be set in production. Add it to your Vercel environment variables.");
  }
  return b ?? "https://api.sandbox.conduit.financial/v2";
}

export class ConduitError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ConduitError";
  }
}

export async function conduitRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const apiKey = process.env.CONDUIT_API_KEY ?? "";
  if (!apiKey) throw new ConduitError("CONDUIT_API_KEY not configured", "missing_key", 0);

  const headers: Record<string, string> = {
    "x-api-key":     apiKey,
    "Content-Type":  "application/json",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

  const res = await fetch(`${getBase()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const msg  = (data?.message as string)
               ?? (data?.error as string)
               ?? JSON.stringify(data)
               ?? `Conduit ${res.status}`;
    const type = (data?.code as string)
               ?? (data?.type as string)
               ?? "unknown";
    const err  = new ConduitError(msg, type, res.status);
    (err as ConduitError & { details: unknown }).details = data;
    throw err;
  }

  return data as T;
}

// Sandbox detection — mirrors Bridge's isSandbox pattern
export const isConduitSandbox = (): boolean =>
  (process.env.CONDUIT_API_BASE ?? "").includes("sandbox");
