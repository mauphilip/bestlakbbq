import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant, PriceTier } from "@/lib/types";

const YELP_API = "https://api.yelp.com/v3";
const CACHE_KEY = "kbbq_discover_cache";

export interface DiscoverCandidate extends Partial<Restaurant> {
  yelp_id: string;
  already_tracked: boolean;
  image_url?: string;
  is_closed: boolean;
  kbbq_confidence: "high" | "medium" | "low";
  categories_raw: string[]; // Yelp category aliases for display
}

export interface DiscoverCache {
  candidates: DiscoverCandidate[];
  lastFetched: string;
  totalScanned: number;
}

interface YelpBiz {
  id: string;
  name: string;
  rating: number;
  review_count: number;
  price?: string;
  url: string;
  location: { address1: string; city: string; state: string; zip_code: string };
  coordinates: { latitude: number; longitude: number };
  categories: { alias: string; title: string }[];
  image_url?: string;
  is_closed: boolean;
}

async function searchYelp(
  params: Record<string, string>
): Promise<{ businesses: YelpBiz[]; total: number; error?: string }> {
  const qs = new URLSearchParams({ limit: "50", sort_by: "review_count", ...params });
  const res = await fetch(`${YELP_API}/businesses/search?${qs}`, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
  });
  const json = await res.json();
  if (!res.ok) return { businesses: [], total: 0, error: json.error?.description ?? `HTTP ${res.status}` };
  return json;
}

// Score how likely a Yelp biz is actually a Korean BBQ restaurant
function getKbbqConfidence(biz: YelpBiz): "high" | "medium" | "low" {
  const aliases = biz.categories.map((c) => c.alias);

  // Direct KBBQ category → definitive
  if (aliases.includes("koreanbbq")) return "high";

  // Name contains strong KBBQ signals
  const strongKeywords = /\b(kbbq|galbi|gal-bi|bulgogi|bbq|grill|gopchang|samgyeopsal|yakiniku|숯불|고기|갈비|구이|barbecue)\b/i;
  if (strongKeywords.test(biz.name)) return "medium";

  // Korean category but no KBBQ signals — likely non-BBQ Korean food
  return "low";
}

function buildKnownSet(restaurants: Restaurant[]): { ids: Set<string>; slugs: Set<string>; names: Set<string> } {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const names = new Set<string>();
  for (const r of restaurants) {
    if (r.yelp_id) ids.add(r.yelp_id);
    if (r.yelp_url) {
      const match = r.yelp_url.match(/yelp\.com\/biz\/([^?#/]+)/);
      if (match) slugs.add(match[1]);
    }
    names.add(r.name.toLowerCase().trim());
  }
  return { ids, slugs, names };
}

function cityToNeighborhood(city: string): string {
  const map: Record<string, string> = {
    "Los Angeles": "Los Angeles",
    Koreatown: "Koreatown",
    Gardena: "Gardena",
    Torrance: "Torrance",
    Irvine: "Irvine",
    Anaheim: "Anaheim",
    Cerritos: "Cerritos",
    Fullerton: "Fullerton",
    "Buena Park": "Buena Park",
    "Diamond Bar": "Diamond Bar",
    Alhambra: "Alhambra",
    "Rowland Heights": "Rowland Heights",
    Glendale: "Glendale",
    "Van Nuys": "Van Nuys",
  };
  return map[city] ?? city;
}

// Two search passes per location:
// Pass 1: categories=koreanbbq (high-precision, may miss uncategorised spots)
// Pass 2: term="korean bbq", categories=korean (broader net — catches spots tagged only as "Korean")
const SEARCH_LOCATIONS = [
  "Koreatown, Los Angeles, CA",
  "Los Angeles, CA",
  "Gardena, CA",
  "Torrance, CA",
  "Rowland Heights, CA",
  "Irvine, CA",
  "Cerritos, CA",
  "Buena Park, CA",
];

async function runDiscovery(known: ReturnType<typeof buildKnownSet>) {
  const seen = new Set<string>();
  const candidates: DiscoverCandidate[] = [];
  const errors: string[] = [];

  for (const loc of SEARCH_LOCATIONS) {
    // Pass 1 — category=koreanbbq
    for (let offset = 0; offset < 200; offset += 50) {
      const page = await searchYelp({ categories: "koreanbbq", location: loc, offset: String(offset) });
      if (page.error) { errors.push(`[koreanbbq] ${loc}: ${page.error}`); break; }
      if (!page.businesses?.length) break;

      for (const biz of page.businesses) {
        if (seen.has(biz.id)) continue;
        seen.add(biz.id);
        candidates.push(bizToCandidate(biz, known));
      }

      if (offset + 50 >= Math.min(page.total ?? 0, 200)) break;
      await delay(200);
    }

    // Pass 2 — term="korean bbq grill", categories=korean (catch mis-categorised spots)
    for (let offset = 0; offset < 100; offset += 50) {
      const page = await searchYelp({
        term: "korean bbq grill galbi",
        categories: "korean",
        location: loc,
        offset: String(offset),
      });
      if (page.error) { errors.push(`[korean+term] ${loc}: ${page.error}`); break; }
      if (!page.businesses?.length) break;

      for (const biz of page.businesses) {
        if (seen.has(biz.id)) continue;
        seen.add(biz.id);
        const candidate = bizToCandidate(biz, known);
        // Only keep medium/high confidence from this broader pass
        if (candidate.kbbq_confidence !== "low") {
          candidates.push(candidate);
        }
      }

      if (offset + 50 >= Math.min(page.total ?? 0, 100)) break;
      await delay(200);
    }
  }

  return { candidates, totalScanned: seen.size, errors };
}

function bizToCandidate(biz: YelpBiz, known: ReturnType<typeof buildKnownSet>): DiscoverCandidate {
  const slug = biz.url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] ?? "";
  const alreadyTracked =
    known.ids.has(biz.id) ||
    (slug && known.slugs.has(slug)) ||
    known.names.has(biz.name.toLowerCase().trim());

  return {
    id: slug || biz.id,
    yelp_id: biz.id,
    name: biz.name,
    neighborhood: cityToNeighborhood(biz.location.city),
    ayce: false,
    ayce_tiers: [],
    non_ayce_est_per_person: null,
    price_tier: (biz.price ?? "$$") as PriceTier,
    price_verified: false,
    yelp_rating: biz.rating,
    google_rating: 0,
    review_count: biz.review_count,
    yelp_url: biz.url,
    lat: biz.coordinates.latitude,
    lng: biz.coordinates.longitude,
    notes: "",
    last_price_check: new Date().toISOString().slice(0, 10),
    last_yelp_sync: new Date().toISOString(),
    already_tracked: alreadyTracked,
    image_url: biz.image_url,
    is_closed: biz.is_closed,
    kbbq_confidence: getKbbqConfidence(biz),
    categories_raw: biz.categories.map((c) => c.alias),
  };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── GET /api/restaurants/yelp-discover
// ?refresh=1  → force re-fetch from Yelp and update cache
// (default)   → return cached results from KV if available
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.YELP_API_KEY) {
    return NextResponse.json({ error: "YELP_API_KEY not configured" }, { status: 500 });
  }

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  // Load current tracked restaurants to mark already_tracked
  let base: Restaurant[] = [];
  let kv: Restaurant[] = [];
  try {
    base = baseRestaurants as Restaurant[];
    kv = (await getKVRestaurants()) as unknown as Restaurant[];
  } catch (e) {
    return NextResponse.json({ error: `DB error: ${e}` }, { status: 500 });
  }
  const all = [...base, ...kv];
  const known = buildKnownSet(all);

  // Load existing cache
  let cache: DiscoverCache | null = null;
  try {
    cache = await redis.get<DiscoverCache>(CACHE_KEY);
  } catch {
    // KV unavailable — fall through to fresh fetch
  }

  if (cache && !forceRefresh) {
    // Re-evaluate already_tracked against current DB (restaurants may have been added since cache was built)
    const updated = cache.candidates.map((c) => ({
      ...c,
      already_tracked:
        (c.yelp_id ? known.ids.has(c.yelp_id) : false) ||
        (c.id ? known.slugs.has(c.id) : false) ||
        known.names.has((c.name ?? "").toLowerCase().trim()),
    }));
    return NextResponse.json({
      candidates: updated,
      totalScanned: cache.totalScanned,
      lastFetched: cache.lastFetched,
      fromCache: true,
    });
  }

  // Fresh fetch from Yelp
  const { candidates: fresh, totalScanned, errors } = await runDiscovery(known);

  // Merge with existing cache (preserve candidates not in fresh results, add new ones)
  const merged = mergeWithCache(cache?.candidates ?? [], fresh);

  const newCache: DiscoverCache = {
    candidates: merged,
    lastFetched: new Date().toISOString(),
    totalScanned,
  };

  try {
    // Cache for 7 days
    await redis.set(CACHE_KEY, newCache, { ex: 60 * 60 * 24 * 7 });
  } catch {
    // Non-fatal — still return results
  }

  const newCount = merged.filter((c) => !c.already_tracked && !c.is_closed && c.kbbq_confidence !== "low").length;
  return NextResponse.json({
    candidates: merged,
    totalScanned,
    newCount,
    errors,
    fromCache: false,
    lastFetched: newCache.lastFetched,
  });
}

// Merge fresh Yelp results into existing cache
// Deduplicates by yelp_id; fresh data wins for fields that Yelp owns
function mergeWithCache(existing: DiscoverCandidate[], fresh: DiscoverCandidate[]): DiscoverCandidate[] {
  const byId = new Map<string, DiscoverCandidate>();
  for (const c of existing) byId.set(c.yelp_id, c);
  for (const c of fresh) {
    const prev = byId.get(c.yelp_id);
    byId.set(c.yelp_id, prev ? { ...prev, ...c } : c);
  }
  // Sort: high confidence first, then by review count
  return Array.from(byId.values()).sort((a, b) => {
    const conf = { high: 2, medium: 1, low: 0 } as const;
    const cd = conf[b.kbbq_confidence] - conf[a.kbbq_confidence];
    if (cd !== 0) return cd;
    return (b.review_count ?? 0) - (a.review_count ?? 0);
  });
}
