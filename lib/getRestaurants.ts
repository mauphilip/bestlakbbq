import { getKVRestaurants } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

/**
 * Returns the live merged restaurant list: base JSON + KV overrides/additions.
 * KV deletions (restaurant removed from KV) are excluded.
 * Call this in server components instead of importing restaurants.json directly.
 */
export async function getAllRestaurants(): Promise<Restaurant[]> {
  let kvRestaurants: Restaurant[] = [];
  try {
    kvRestaurants = (await getKVRestaurants()) as unknown as Restaurant[];
  } catch {
    // KV unavailable — fall back to base JSON only
  }

  const kvIds = new Set(kvRestaurants.map((r) => r.id));
  const baseIds = new Set((baseRestaurants as Restaurant[]).map((r) => r.id));

  // Base restaurants that have a KV override — merge (KV wins)
  const baseWithKvOverrides = (baseRestaurants as Restaurant[])
    .filter((r) => kvIds.has(r.id))
    .map((r) => {
      const kv = kvRestaurants.find((k) => k.id === r.id)!;
      return { ...r, ...kv };
    });

  // Base restaurants with no KV entry — pass through unchanged
  const baseOnly = (baseRestaurants as Restaurant[]).filter((r) => !kvIds.has(r.id));

  // Pure KV-only restaurants (admin additions not in base JSON)
  const kvOnly = kvRestaurants.filter((r) => !baseIds.has(r.id));

  return [...baseOnly, ...baseWithKvOverrides, ...kvOnly].filter((r) => !r.is_deleted);
}
