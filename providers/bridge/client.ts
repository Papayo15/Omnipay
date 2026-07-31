// Base HTTP client for Bridge.xyz API
// Reads BRIDGE_API_BASE (default: sandbox) and BRIDGE_API_KEY from env.

const BASE = process.env.BRIDGE_API_BASE ?? "https://api.sandbox.bridge.xyz/v0";

export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export async function bridgeRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const apiKey = process.env.BRIDGE_API_KEY ?? "";
  if (!apiKey) throw new BridgeError("BRIDGE_API_KEY not configured", "missing_key", 0);

  const headers: Record<string, string> = {
    "Api-Key":      apiKey,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res  = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const errField = data?.error;
    const msg  = (errField as Record<string,string>)?.message
               ?? (data?.message as string)
               ?? (typeof errField === "string" ? errField : undefined)
               ?? JSON.stringify(data)
               ?? `Bridge ${res.status}`;
    const type = (errField as Record<string,string>)?.type
               ?? (data?.code as string)
               // Bridge sometimes sends error as a plain string — normalise to snake_case for catch blocks
               ?? (typeof errField === "string"
                   ? (errField as string).toLowerCase().replace(/\s+/g, "_")
                   : "unknown");
    const err  = new BridgeError(msg, type, res.status);
    (err as BridgeError & { details: unknown }).details = data;
    throw err;
  }

  return data as T;
}
