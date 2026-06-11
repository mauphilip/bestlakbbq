import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// ─── Restaurant additions (admin-managed, stored in KV) ───
// Storage: ONE Redis hash (id → record) so reads are a single HGETALL instead of
// KEYS + MGET (KEYS is O(whole keyspace) and Upstash bills per command).
// The legacy per-key layout (kbbq_restaurant_<id>) is migrated into the hash on
// first read and the old keys are deleted; migration is idempotent.
export const KV_RESTAURANTS_HASH = "kbbq_restaurants";
export const KV_RESTAURANT_PREFIX = "kbbq_restaurant_"; // legacy layout
export const KV_VISIT_PREFIX = "kbbq_visit_";

type Rec = Record<string, unknown>;

export async function getKVRestaurants(): Promise<Rec[]> {
  const hash = await redis.hgetall<Record<string, Rec>>(KV_RESTAURANTS_HASH);
  if (hash && Object.keys(hash).length) return Object.values(hash);

  // Legacy layout — migrate once, then serve from the hash forever after
  const keys = await redis.keys(`${KV_RESTAURANT_PREFIX}*`);
  if (!keys.length) return [];
  const values = (await redis.mget<Rec[]>(...keys)).filter(Boolean) as Rec[];
  const withIds = values.filter((v) => typeof v.id === "string" && v.id);
  if (withIds.length) {
    await redis.hset(KV_RESTAURANTS_HASH, Object.fromEntries(withIds.map((v) => [v.id as string, v])));
    await redis.del(...keys);
    console.log(`[kv] migrated ${withIds.length} restaurants from per-key layout to ${KV_RESTAURANTS_HASH}`);
  }
  return withIds;
}

export async function getKVRestaurant(id: string): Promise<Rec | null> {
  const fromHash = await redis.hget<Rec>(KV_RESTAURANTS_HASH, id);
  if (fromHash) return fromHash;
  // Pre-migration fallback
  return await redis.get<Rec>(`${KV_RESTAURANT_PREFIX}${id}`);
}

export async function setKVRestaurant(id: string, value: Rec): Promise<void> {
  await redis.hset(KV_RESTAURANTS_HASH, { [id]: value });
}

/** Bulk upsert — one HSET round trip for any number of records. */
export async function setKVRestaurants(records: Record<string, Rec>): Promise<void> {
  if (!Object.keys(records).length) return;
  await redis.hset(KV_RESTAURANTS_HASH, records);
}

export async function deleteKVRestaurant(id: string): Promise<void> {
  await redis.hdel(KV_RESTAURANTS_HASH, id);
  // Clear any straggler from the legacy layout too
  await redis.del(`${KV_RESTAURANT_PREFIX}${id}`);
}

export async function getKVVisits() {
  const keys = await redis.keys(`${KV_VISIT_PREFIX}*`);
  if (!keys.length) return [];
  const values = await redis.mget<Record<string, unknown>[]>(...keys);
  return values.filter(Boolean) as Record<string, unknown>[];
}
