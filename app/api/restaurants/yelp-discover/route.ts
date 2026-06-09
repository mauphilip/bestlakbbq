import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant, PriceTier } from "@/lib/types";
import type { DiscoverCandidate, DiscoverCache } from "@/lib/yelp-types";

const YELP_API = "https://api.yelp.com/v3";
const CACHE_KEY = "kbbq_discover_cache";

// Yelp category aliases that are NOT Korean BBQ — used to hard-filter results
// from the broader barbeque,korean compound search
const NON_KBBQ_BLOCKLIST = new Set([
  "coffee",
  "cafes",
  "coffeeroasteries",
  "bubbletea",
  "bakeries",
  "desserts",
  "icecream",
  "hotdog",
  "pizza",
  "japanese",
  "sushi",
  "ramen",
  "chinese",
  "dimsum",
  "vietnamese",
  "thai",
  "mexican",
  "indpak",
  "hotpot",
  "soup",
  "sandwiches",
  "burgers",
  "chickenshop",
  "seafood",
  "bars",
  "nightlife",
  "karaoke",
  "convenience",
  "grocery",
  "markets",
  "convenience",
]);

// Businesses whose name contains these strings are almost certainly not KBBQ
const NAME_BLOCKLIST = [
  /coffee/i, /cafe/i, /boba/i, /tea house/i, /tofu/i, /순두부/i,
  /bakery/i, /pastry/i, /ramen/i, /pho/i, /sushi/i, /pizza/i,
  /karaoke/i, /grocery/i, /market/i, /mart\b/i,
];

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

// Confidence that this biz is actually a Korean BBQ restaurant
function getKbbqConfidence(biz: YelpBiz): "high" | "medium" | "low" {
  const aliases = biz.categories.map((c) => c.alias);

  // Has the dedicated Korean BBQ Yelp category → definitive
  if (aliases.includes("koreanbbq")) return "high";

  // Name has strong KBBQ signals
  const bbqNamePattern = /\b(kbbq|galbi|gal-bi|bulgogi|gopchang|samgyeopsal|yakiniku|숯불|고기|갈비|구이|bbq|grill|barbeque|barbecue)\b/i;
  if (bbqNamePattern.test(biz.name)) return "medium";

  return "low";
}

// Hard filter: reject if biz clearly isn't KBBQ
function isDefinitelyNotKbbq(biz: YelpBiz): boolean {
  // Blocked by name
  if (NAME_BLOCKLIST.some((re) => re.test(biz.name))) return true;
  // Blocked if ALL categories are non-BBQ
  const aliases = biz.categories.map((c) => c.alias);
  if (aliases.every((a) => NON_KBBQ_BLOCKLIST.has(a))) return true;
  return false;
}

function buildKnownSet(restaurants: Restaurant[]) {
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

// Two Yelp search strategies per location:
// Strategy A: categories=koreanbbq — Yelp's dedicated KBBQ category (highest precision)
// Strategy B: categories=barbeque,korean — compound category filter (catches spots tagged
//             as both barbeque AND korean but missing the koreanbbq alias)
// Both strategies then apply the hard blocklist + confidence scoring
async function runDiscovery(known: ReturnType<typeof buildKnownSet>) {
  const seen = new Set<string>();
  const candidates: DiscoverCandidate[] = [];
  const errors: string[] = [];

  const strategies = [
    { categories: "koreanbbq" },
    { categories: "barbeque,korean" },
  ];

  for (const loc of SEARCH_LOCATIONS) {
    for (const strategy of strategies) {
      for (let offset = 0; offset < 200; offset += 50) {
        const page = await searchYelp({ ...strategy, location: loc, offset: String(offset) });
        if (page.error) { errors.push(`[${strategy.categories}] ${loc}: ${page.error}`); break; }
        if (!page.businesses?.length) break;

        for (const biz of page.businesses) {
          if (seen.has(biz.id)) continue;
          seen.add(biz.id);

          // Hard filter: skip obvious non-KBBQ
          if (isDefinitelyNotKbbq(biz)) continue;

          const candidate = bizToCandidate(biz, known);

          // From the broader barbeque+korean strategy, require at least medium confidence
          if (strategy.categories !== "koreanbbq" && candidate.kbbq_confidence === "low") continue;

          candidates.push(candidate);
        }

        if (offset + 50 >= Math.min(page.total ?? 0, 200)) break;
        await delay(200);
      }
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

function mergeWithCache(existing: DiscoverCandidate[], fresh: DiscoverCandidate[]): DiscoverCandidate[] {
  const byId = new Map<string, DiscoverCandidate>();
  for (const c of existing) byId.set(c.yelp_id, c);
  for (const c of fresh) {
    const prev = byId.get(c.yelp_id);
    byId.set(c.yelp_id, prev ? { ...prev, ...c } : c);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const conf = { high: 2, medium: 1, low: 0 } as const;
    const cd = conf[b.kbbq_confidence] - conf[a.kbbq_confidence];
    if (cd !== 0) return cd;
    return (b.review_count ?? 0) - (a.review_count ?? 0);
  });
}

// GET /api/restaurants/yelp-discover
// ?refresh=1 → force re-scan Yelp and update cache
// default    → return KV cache; if empty, return empty (don't auto-scan)
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.YELP_API_KEY) {
    return NextResponse.json({ error: "YELP_API_KEY not configured" }, { status: 500 });
  }

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

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

  // Try to load existing cache
  let cache: DiscoverCache | null = null;
  try {
    cache = await redis.get<DiscoverCache>(CACHE_KEY);
  } catch { /* KV unavailable */ }

  // Return cache without hitting Yelp (default page-load behaviour)
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

  // No cache and no refresh requested → return empty so the UI shows the "Fetch" button
  if (!forceRefresh) {
    return NextResponse.json({ candidates: [], totalScanned: 0, fromCache: false });
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
    await redis.set(CACHE_KEY, newCache, { ex: 60 * 60 * 24 * 7 }); // 7 days
  } catch { /* non-fatal */ }

  return NextResponse.json({
    candidates: merged,
    totalScanned,
    newCount: merged.filter((c) => !c.already_tracked && !c.is_closed && c.kbbq_confidence !== "low").length,
    errors,
    fromCache: false,
    lastFetched: newCache.lastFetched,
  });
}
