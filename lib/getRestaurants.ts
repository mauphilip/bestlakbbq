import { getKVRestaurants } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";
import { getSettings, isRisky, type SiteSettings } from "@/lib/settings";

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

/**
 * Merged restaurant list split by the admin-editable quality thresholds.
 * `main` = at or above the bar (or featured); `risky` = the "Go at your own risk" list.
 * Nothing is ever deleted by thresholds — risky spots just render demoted.
 */
export async function getPartitionedRestaurants(): Promise<{
  main: Restaurant[];
  risky: Restaurant[];
  settings: SiteSettings;
}> {
  const [all, settings] = await Promise.all([getAllRestaurants(), getSettings()]);
  const main: Restaurant[] = [];
  const risky: Restaurant[] = [];
  for (const r of all) (isRisky(r, settings) ? risky : main).push(r);
  return { main, risky, settings };
}
