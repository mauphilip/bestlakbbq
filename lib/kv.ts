import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// ─── Restaurant additions (admin-managed, stored in KV) ───
export const KV_RESTAURANT_PREFIX = "kbbq_restaurant_";
export const KV_VISIT_PREFIX = "kbbq_visit_";

export async function getKVRestaurants() {
  const keys = await redis.keys(`${KV_RESTAURANT_PREFIX}*`);
  if (!keys.length) return [];
  const values = await redis.mget<Record<string, unknown>[]>(...keys);
  return values.filter(Boolean) as Record<string, unknown>[];
}

export async function getKVVisits() {
  const keys = await redis.keys(`${KV_VISIT_PREFIX}*`);
  if (!keys.length) return [];
  const values = await redis.mget<Record<string, unknown>[]>(...keys);
  return values.filter(Boolean) as Record<string, unknown>[];
}
