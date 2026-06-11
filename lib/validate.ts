// Field whitelisting + validation for KV-bound mutation bodies.
// Restaurant ids become Redis key suffixes, so they're strictly constrained.

import { KBBQ_PRICE_RANGES, type Restaurant, type AyceTier, type Visit } from "@/lib/types";

export const RESTAURANT_ID_RE = /^[a-zA-Z0-9._-]{1,120}$/;

const MAX_STR = 300;
const MAX_NOTES = 2000;

function str(v: unknown, max = MAX_STR): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function ayceTiers(v: unknown): AyceTier[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const tiers: AyceTier[] = [];
  for (const t of v.slice(0, 10)) {
    if (t && typeof t === "object") {
      const label = str((t as Record<string, unknown>).label, 100);
      const price = num((t as Record<string, unknown>).price);
      if (label !== undefined && price !== undefined && price >= 0 && price <= 1000) {
        tiers.push({ label, price });
      }
    }
  }
  return tiers;
}

type SanitizeResult =
  | { ok: true; value: Partial<Restaurant> & { id: string } }
  | { ok: false; error: string };

/**
 * Whitelist + type-check a restaurant mutation body. Unknown fields are dropped.
 * Returns only the fields present and valid, so it works for both create (POST)
 * and partial update (PUT spreads over the existing record).
 */
export function sanitizeRestaurant(body: unknown): SanitizeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  const id = str(b.id, 120);
  if (!id || !RESTAURANT_ID_RE.test(id)) {
    return { ok: false, error: "id is required and must be 1-120 chars of [a-zA-Z0-9._-]" };
  }

  const out: Partial<Restaurant> & { id: string } = { id };
  const setIf = <K extends keyof Restaurant>(key: K, val: Restaurant[K] | undefined) => {
    if (val !== undefined) out[key] = val;
  };

  setIf("name", str(b.name));
  setIf("neighborhood", str(b.neighborhood, 100));
  setIf("ayce", bool(b.ayce));
  setIf("ayce_tiers", ayceTiers(b.ayce_tiers));
  if (b.non_ayce_est_per_person === null) out.non_ayce_est_per_person = null;
  else setIf("non_ayce_est_per_person", num(b.non_ayce_est_per_person));
  if (typeof b.price_tier === "string" && b.price_tier in KBBQ_PRICE_RANGES) {
    out.price_tier = b.price_tier as Restaurant["price_tier"];
  }
  setIf("price_verified", bool(b.price_verified));
  setIf("yelp_id", str(b.yelp_id, 120));
  setIf("yelp_rating", clampNum(b.yelp_rating, 0, 5));
  setIf("google_rating", clampNum(b.google_rating, 0, 5));
  setIf("review_count", clampNum(b.review_count, 0, 10_000_000));
  setIf("last_price_check", str(b.last_price_check, 40));
  setIf("last_yelp_sync", str(b.last_yelp_sync, 40));
  setIf("lat", clampNum(b.lat, -90, 90));
  setIf("lng", clampNum(b.lng, -180, 180));
  setIf("yelp_url", httpUrl(b.yelp_url));
  setIf("website", httpUrl(b.website));
  setIf("notes", str(b.notes, MAX_NOTES));
  setIf("is_deleted", bool(b.is_deleted));
  if (b.source === "base" || b.source === "yelp_discover" || b.source === "manual") {
    out.source = b.source;
  }
  setIf("added_at", str(b.added_at, 40));
  setIf("needs_review", bool(b.needs_review));
  setIf("featured", bool(b.featured));
  // kv_managed is set server-side by the routes, never trusted from the body

  return { ok: true, value: out };
}

function clampNum(v: unknown, min: number, max: number): number | undefined {
  const n = num(v);
  if (n === undefined) return undefined;
  return Math.min(max, Math.max(min, n));
}

function httpUrl(v: unknown): string | undefined {
  const s = str(v, 500);
  if (s === undefined) return undefined;
  if (s === "") return "";
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return s;
  } catch { /* invalid */ }
  return undefined;
}

type VisitResult = { ok: true; value: Visit } | { ok: false; error: string };

/** Whitelist + type-check a visit mutation body. */
export function sanitizeVisit(body: unknown): VisitResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const restaurantId = str(b.restaurantId, 120);
  if (!restaurantId || !RESTAURANT_ID_RE.test(restaurantId)) {
    return { ok: false, error: "restaurantId is required and must be 1-120 chars of [a-zA-Z0-9._-]" };
  }
  const value: Visit = { restaurantId, visited: bool(b.visited) ?? true };
  const visitDate = str(b.visitDate, 10);
  if (visitDate !== undefined) value.visitDate = visitDate;
  const personalRating = clampNum(b.personalRating, 0, 5);
  if (personalRating !== undefined) value.personalRating = personalRating;
  const wouldGoBack = bool(b.wouldGoBack);
  if (wouldGoBack !== undefined) value.wouldGoBack = wouldGoBack;
  const notes = str(b.notes, MAX_NOTES);
  if (notes !== undefined) value.notes = notes;
  return { ok: true, value };
}
