// Client-safe, PURE Yelp helpers — NO process.env, NO keyed fetch.
// Safe to import from client components. Server-only Yelp calls live in lib/yelp-server.ts.

import type { Restaurant, PriceTier } from "@/lib/types";
import type { DiscoverCandidate } from "@/lib/yelp-types";

/** The single canonical Yelp category alias for KBBQ searches.
 *  Comma-separated aliases are treated as OR by Yelp and flood results, so use just this. */
export const KBBQ_CATEGORY = "koreanbbq";

/** Category aliases that unambiguously mean Korean BBQ. */
export const KBBQ_ALIASES = ["koreanbbq", "kbbq", "korean_bbq"];

/** Name keywords that strongly hint KBBQ even without the category tag. */
export const KBBQ_NAME_RE = /\b(kbbq|galbi|bulgogi|gopchang|samgyeopsal|숯불|고기|갈비|구이|bbq grill)\b/i;

/** Slug regex — single source of truth. */
export const YELP_SLUG_RE = /yelp\.com\/biz\/([^?#/]+)/;

export function slugFromUrl(url?: string | null): string | null {
  if (!url) return null;
  return url.match(YELP_SLUG_RE)?.[1] ?? null;
}

/** Resolve a restaurant's Yelp id: explicit yelp_id wins, else the slug from its URL. */
export function getYelpId(r: { yelp_id?: string; yelp_url?: string }): string | null {
  if (r.yelp_id) return r.yelp_id;
  return slugFromUrl(r.yelp_url);
}

/** True when a restaurant is linked to a Yelp business (has an id or a /biz/ URL). */
export function isYelpConnected(r: { yelp_id?: string; yelp_url?: string }): boolean {
  return getYelpId(r) !== null;
}

/** Minimal shape of a Yelp business (search or detail result) we depend on. */
export interface YelpBizLite {
  id: string;
  name: string;
  rating?: number;
  review_count?: number;
  price?: string;
  url?: string;
  image_url?: string;
  is_closed?: boolean;
  location?: { address1?: string; city?: string; state?: string; zip_code?: string };
  coordinates?: { latitude?: number; longitude?: number };
  categories?: { alias: string; title: string }[];
}

/**
 * Unified KBBQ confidence — merge of the previous server (getKbbqConfidence) and
 * client (kbbqStatus) implementations.
 *  - koreanbbq/kbbq alias, OR a category title with both "korean" & "bbq"  → high
 *  - any "korean" alias, OR a KBBQ keyword in the name                     → medium
 *  - otherwise                                                             → low
 */
export function kbbqConfidence(biz: YelpBizLite): "high" | "medium" | "low" {
  const aliases = (biz.categories ?? []).map((c) => c.alias.toLowerCase());
  const titles = (biz.categories ?? []).map((c) => (c.title ?? "").toLowerCase());
  if (aliases.some((a) => KBBQ_ALIASES.includes(a))) return "high";
  if (titles.some((t) => t.includes("korean") && t.includes("bbq"))) return "high";
  if (aliases.some((a) => a.includes("korean"))) return "medium";
  if (biz.name && KBBQ_NAME_RE.test(biz.name)) return "medium";
  return "low";
}

/**
 * Build a discover candidate from a Yelp business. Neighborhood + alreadyTracked are
 * computed by the caller (the route owns the zip→neighborhood map and the known set).
 */
export function bizToCandidate(
  biz: YelpBizLite,
  opts: { neighborhood: string; alreadyTracked: boolean; nowIso?: string }
): DiscoverCandidate {
  const slug = slugFromUrl(biz.url) ?? "";
  const now = opts.nowIso ?? new Date().toISOString();
  return {
    id: slug || biz.id || "",
    yelp_id: biz.id ?? "",
    name: biz.name ?? "",
    neighborhood: opts.neighborhood,
    zip_code: biz.location?.zip_code,
    ayce: false,
    ayce_tiers: [],
    non_ayce_est_per_person: null,
    price_tier: biz.price ?? "$$",
    price_verified: false,
    yelp_rating: biz.rating ?? 0,
    google_rating: 0,
    review_count: biz.review_count ?? 0,
    yelp_url: biz.url ?? "",
    lat: biz.coordinates?.latitude ?? 34.05,
    lng: biz.coordinates?.longitude ?? -118.3,
    notes: "",
    last_price_check: now.slice(0, 10),
    last_yelp_sync: now,
    kv_managed: true,
    already_tracked: opts.alreadyTracked,
    image_url: biz.image_url,
    is_closed: biz.is_closed ?? false,
    kbbq_confidence: kbbqConfidence(biz),
    categories_raw: (biz.categories ?? []).map((c) => c.alias),
  };
}

/**
 * Map a Yelp business to a Partial<Restaurant> for the add/edit form prefill.
 * CRITICAL: captures yelp_id so a restaurant added from search is linked.
 * Does NOT hardcode `ayce` (the form supplies its own default).
 */
export function bizToRestaurantPartial(biz: YelpBizLite): Partial<Restaurant> {
  return {
    id: slugFromUrl(biz.url) ?? biz.id,
    name: biz.name,
    neighborhood: biz.location?.city ?? "",
    yelp_id: biz.id,
    yelp_url: biz.url ?? "",
    yelp_rating: biz.rating ?? 0,
    google_rating: 0,
    review_count: biz.review_count ?? 0,
    price_tier: (biz.price as PriceTier | undefined) ?? undefined,
    notes: "",
  };
}
