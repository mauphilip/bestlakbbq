import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant, PriceTier } from "@/lib/types";
import type { DiscoverCandidate, DiscoverCache } from "@/lib/yelp-types";

const YELP_API = "https://api.yelp.com/v3";
const CACHE_KEY = "kbbq_discover_cache";

// Yelp only searches `categories=koreanbbq`.
// This is the dedicated KBBQ category alias and is the most accurate filter.
// "barbeque,korean" looked correct but Yelp treats comma-separated categories as OR
// (returns any BBQ place OR any Korean place), which floods results with coffee shops etc.

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

async function yelpSearch(
  params: Record<string, string>
): Promise<{ businesses: YelpBiz[]; total: number; error?: string }> {
  const qs = new URLSearchParams({ limit: "50", sort_by: "review_count", ...params });
  try {
    const res = await fetch(`${YELP_API}/businesses/search?${qs}`, {
      headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    });
    const json = await res.json();
    if (!res.ok) return { businesses: [], total: 0, error: json.error?.description ?? `HTTP ${res.status}` };
    return { businesses: json.businesses ?? [], total: json.total ?? 0 };
  } catch (e) {
    return { businesses: [], total: 0, error: String(e) };
  }
}

function getKbbqConfidence(biz: YelpBiz): "high" | "medium" | "low" {
  const aliases = biz.categories.map((c) => c.alias);
  if (aliases.includes("koreanbbq")) return "high";
  // Has BBQ-related keywords in name even without the koreanbbq category tag
  if (/\b(kbbq|galbi|bulgogi|gopchang|samgyeopsal|숯불|고기|갈비|구이|bbq grill)\b/i.test(biz.name)) return "medium";
  return "low";
}

function buildKnownSet(restaurants: Restaurant[]) {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const names = new Set<string>();
  for (const r of restaurants) {
    if (r.yelp_id) ids.add(r.yelp_id);
    if (r.yelp_url) {
      const m = r.yelp_url.match(/yelp\.com\/biz\/([^?#/]+)/);
      if (m) slugs.add(m[1]);
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

const LOCATIONS = [
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

  for (const location of LOCATIONS) {
    // Paginate up to 200 results per location (Yelp max with offset)
    for (let offset = 0; offset < 200; offset += 50) {
      const page = await yelpSearch({ categories: "koreanbbq", location, offset: String(offset) });

      if (page.error) {
        errors.push(`${location} (offset ${offset}): ${page.error}`);
        break;
      }
      if (!page.businesses.length) break;

      for (const biz of page.businesses) {
        if (seen.has(biz.id)) continue;
        seen.add(biz.id);
        candidates.push(bizToCandidate(biz, known));
      }

      // Stop paginating if we've seen all results
      if (offset + 50 >= Math.min(page.total, 200)) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return { candidates, totalScanned: seen.size, errors };
}

function bizToCandidate(biz: YelpBiz, known: ReturnType<typeof buildKnownSet>): DiscoverCandidate {
  const slug = biz.url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] ?? "";
  const alreadyTracked =
    known.ids.has(biz.id) ||
    (slug ? known.slugs.has(slug) : false) ||
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
    lat: biz.coordinates?.latitude ?? 34.05,
    lng: biz.coordinates?.longitude ?? -118.3,
    notes: "",
    last_price_check: new Date().toISOString().slice(0, 10),
    last_yelp_sync: new Date().toISOString(),
    kv_managed: true,
    already_tracked: alreadyTracked,
    image_url: biz.image_url,
    is_closed: biz.is_closed,
    kbbq_confidence: getKbbqConfidence(biz),
    categories_raw: biz.categories.map((c) => c.alias),
  };
}

function mergeWithCache(existing: DiscoverCandidate[], fresh: DiscoverCandidate[]): DiscoverCandidate[] {
  const byId = new Map<string, DiscoverCandidate>();
  for (const c of existing) byId.set(c.yelp_id, c);
  for (const c of fresh) {
    const prev = byId.get(c.yelp_id);
    // Fresh data wins for Yelp-sourced fields; preserve any manual overrides
    byId.set(c.yelp_id, prev ? { ...prev, ...c } : c);
  }
  // High confidence first, then by review count
  return Array.from(byId.values()).sort((a, b) => {
    const w = { high: 2, medium: 1, low: 0 } as const;
    const d = w[b.kbbq_confidence] - w[a.kbbq_confidence];
    return d !== 0 ? d : (b.review_count ?? 0) - (a.review_count ?? 0);
  });
}

// GET /api/restaurants/yelp-discover
// No params  → return KV cache (or empty if no cache). Does NOT hit Yelp.
// ?refresh=1 → run fresh Yelp scan, merge into cache, return results.
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  try {
    // Build the known-restaurant set (non-fatal — if KV is down, use base JSON only)
    const base = baseRestaurants as Restaurant[];
    let kv: Restaurant[] = [];
    try {
      kv = (await getKVRestaurants()) as unknown as Restaurant[];
    } catch { /* KV unavailable */ }
    const known = buildKnownSet([...base, ...kv]);

    // Load KV cache (non-fatal)
    let cache: DiscoverCache | null = null;
    try {
      cache = await redis.get<DiscoverCache>(CACHE_KEY);
    } catch { /* ignore */ }

    // Serve cache if available and not a forced refresh — no API key needed
    if (cache && !forceRefresh) {
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

    // No cache + no refresh → return empty; UI will show the Fetch button
    if (!forceRefresh) {
      return NextResponse.json({ candidates: [], totalScanned: 0, fromCache: false });
    }

    // Only check API key when we actually need to call Yelp
    if (!process.env.YELP_API_KEY) {
      return NextResponse.json(
        { error: "YELP_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables." },
        { status: 500 }
      );
    }

    // Full Yelp scan
    const { candidates: fresh, totalScanned, errors } = await runDiscovery(known);
    const merged = mergeWithCache(cache?.candidates ?? [], fresh);

    const newCache: DiscoverCache = {
      candidates: merged,
      lastFetched: new Date().toISOString(),
      totalScanned,
    };

    try {
      await redis.set(CACHE_KEY, newCache, { ex: 60 * 60 * 24 * 7 });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      candidates: merged,
      totalScanned,
      newCount: merged.filter((c) => !c.already_tracked && !c.is_closed).length,
      errors: errors.length ? errors : undefined,
      fromCache: false,
      lastFetched: newCache.lastFetched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[yelp-discover]", message);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}
