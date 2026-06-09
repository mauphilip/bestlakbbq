import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis } from "@/lib/kv";
import { KBBQ_CATEGORY, slugFromUrl, bizToCandidate as sharedBizToCandidate, type YelpBizLite } from "@/lib/yelp-shared";
import { yelpSearch } from "@/lib/yelp-server";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";
import type { DiscoverCandidate, DiscoverCache } from "@/lib/yelp-types";

const CACHE_KEY = "kbbq_discover_cache";

// Yelp only searches `categories=koreanbbq` — the dedicated KBBQ alias and the most
// accurate filter. Comma-separated aliases are OR in Yelp and flood results.

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
    if (r.name) names.add(r.name.toLowerCase().trim());
  }
  return { ids, slugs, names };
}

// Zip codes let us distinguish Koreatown / Mid-Wilshire / etc. inside "Los Angeles"
// and map OC cities to the right neighborhood label for filters.
const ZIP_TO_NEIGHBORHOOD: Record<string, string> = {
  // Koreatown (90004–90006, 90010, 90019–90020)
  "90004": "Koreatown", "90005": "Koreatown", "90006": "Koreatown",
  "90010": "Koreatown", "90019": "Koreatown", "90020": "Koreatown",
  // Mid-Wilshire
  "90036": "Mid-Wilshire",
  // Gardena
  "90247": "Gardena", "90248": "Gardena", "90249": "Gardena",
  // Torrance
  "90501": "Torrance", "90502": "Torrance", "90503": "Torrance",
  "90504": "Torrance", "90505": "Torrance", "90506": "Torrance",
  // Van Nuys / San Fernando Valley
  "91401": "Van Nuys", "91402": "Van Nuys", "91405": "Van Nuys",
  "91406": "Van Nuys", "91411": "Van Nuys", "91423": "Van Nuys",
  // Glendale
  "91201": "Glendale", "91202": "Glendale", "91203": "Glendale",
  "91204": "Glendale", "91205": "Glendale", "91206": "Glendale",
  // Rowland Heights / SGV
  "91748": "Rowland Heights", "91789": "Rowland Heights",
  "91801": "Alhambra", "91803": "Alhambra",
  "91754": "SGV", "91755": "SGV", "91770": "SGV",
  // Orange County
  "92612": "Irvine", "92614": "Irvine", "92617": "Irvine",
  "92618": "Irvine", "92620": "Irvine", "92604": "Irvine",
  "90620": "Buena Park", "90621": "Buena Park",
  "92801": "Anaheim", "92802": "Anaheim", "92804": "Anaheim",
  "90701": "Cerritos", "90703": "Cerritos",
  "92833": "Fullerton", "92835": "Fullerton",
  "92868": "Orange County", "92865": "Orange County",
};

function cityToNeighborhood(city: string, zip?: string, zipMap: Record<string, string> = ZIP_TO_NEIGHBORHOOD): string {
  // Zip takes priority — it disambiguates "Los Angeles" into Koreatown, etc.
  if (zip && zipMap[zip]) return zipMap[zip];
  const map: Record<string, string> = {
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
    Koreatown: "Koreatown",
    "Los Angeles": "Los Angeles", // fallback when zip doesn't match
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

async function runDiscovery(known: ReturnType<typeof buildKnownSet>, zipMap: Record<string, string> = ZIP_TO_NEIGHBORHOOD, locations: string[] = LOCATIONS) {
  const seen = new Set<string>();
  const candidates: DiscoverCandidate[] = [];
  const errors: string[] = [];

  for (const location of locations) {
    // Paginate up to 200 results per location (Yelp max with offset)
    for (let offset = 0; offset < 200; offset += 50) {
      const page = await yelpSearch({ categories: KBBQ_CATEGORY, location, offset: String(offset), sort_by: "review_count" });

      if (page.error) {
        errors.push(`${location} (offset ${offset}): ${page.error}`);
        break;
      }
      if (!page.businesses.length) break;

      for (const biz of page.businesses) {
        if (seen.has(biz.id)) continue;
        seen.add(biz.id);
        candidates.push(bizToCandidate(biz, known, zipMap));
      }

      // Stop paginating if we've seen all results
      if (offset + 50 >= Math.min(page.total, 200)) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return { candidates, totalScanned: seen.size, errors };
}

function bizToCandidate(biz: YelpBizLite, known: ReturnType<typeof buildKnownSet>, zipMap: Record<string, string> = ZIP_TO_NEIGHBORHOOD): DiscoverCandidate {
  const slug = slugFromUrl(biz.url) ?? "";
  const alreadyTracked =
    (biz.id ? known.ids.has(biz.id) : false) ||
    (slug ? known.slugs.has(slug) : false) ||
    (biz.name ? known.names.has(biz.name.toLowerCase().trim()) : false);

  return sharedBizToCandidate(biz, {
    neighborhood: cityToNeighborhood(biz.location?.city ?? "", biz.location?.zip_code, zipMap),
    alreadyTracked,
  });
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
  const locationParam = req.nextUrl.searchParams.get("locations");
  const selectedLocations = forceRefresh && locationParam
    ? LOCATIONS.filter((l) => locationParam.split(",").some((p) => l.toLowerCase().startsWith(p.toLowerCase().trim())))
    : LOCATIONS;

  try {
    // Build the known-restaurant set (non-fatal — if KV is down, use base JSON only)
    const base = baseRestaurants as Restaurant[];
    let kv: Restaurant[] = [];
    try {
      kv = (await getKVRestaurants()) as unknown as Restaurant[];
    } catch { /* KV unavailable */ }
    const known = buildKnownSet([...base, ...kv]);

    // Load KV neighborhood overrides (non-fatal)
    let zipMap: Record<string, string> = { ...ZIP_TO_NEIGHBORHOOD };
    try {
      const overrides = await redis.get<Record<string, string>>("kbbq_neighborhood_overrides");
      if (overrides) zipMap = { ...ZIP_TO_NEIGHBORHOOD, ...overrides };
    } catch { /* non-fatal */ }

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
        // Re-apply neighborhood with current zipMap so overrides take effect on cache hits
        neighborhood: c.zip_code && zipMap[c.zip_code]
          ? zipMap[c.zip_code]
          : c.neighborhood,
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
    const { candidates: fresh, totalScanned, errors } = await runDiscovery(known, zipMap, selectedLocations);
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
