import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

let _client: RedisClient | null = null;

export async function getRedis(): Promise<RedisClient> {
  if (_client?.isReady) return _client;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not configured");

  _client = createClient({ url });
  _client.on("error", (e: Error) => console.error("[redis]", e.message));
  await _client.connect();
  return _client;
}
