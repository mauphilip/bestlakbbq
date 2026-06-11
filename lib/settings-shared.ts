// Client-safe, PURE settings helpers — NO KV access. Server reads live in lib/settings.ts.

/** Site-wide quality thresholds, editable in admin → Settings. */
export interface SiteSettings {
  /** Spots below this Yelp rating move to the "Go at your own risk" list. */
  min_rating: number;
  /** Spots with fewer reviews than this also move to the risk list (0 = off). */
  min_review_count: number;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  min_rating: 3.0,
  min_review_count: 0,
};

/** True when a restaurant falls below the quality bar (and isn't a pinned favorite). */
export function isRisky(
  r: { yelp_rating: number; review_count: number; featured?: boolean },
  settings: SiteSettings
): boolean {
  if (r.featured) return false;
  return r.yelp_rating < settings.min_rating || r.review_count < settings.min_review_count;
}
