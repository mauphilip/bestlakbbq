import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis } from "@/lib/kv";
import { KBBQ_CATEGORY, slugFromUrl, bizToCandidate as sharedBizToCandidate, type YelpBizLite } from "@/lib/yelp-shared";
import { yelpSearch, YelpRateLimitError } from "@/lib/yelp-server";
import { SEED_LOCATIONS } from "@/lib/discover-locations";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";
import type { DiscoverCandidate, DiscoverCache } from "@/lib/yelp-types";
import { DEFAULT_ZIP_MAP, getZipMap } from "@/lib/neighborhoods";

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

function cityToNeighborhood(city: string, zip?: string, zipMap: Record<string, string> = DEFAULT_ZIP_MAP): string {
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

const LOCATIONS = SEED_LOCATIONS.map((l) => l.key);

async function runDiscovery(known: ReturnType<typeof buildKnownSet>, zipMap: Record<string, string> = DEFAULT_ZIP_MAP, locations: string[] = LOCATIONS) {
  const seen = new Set<string>();
  const candidates: DiscoverCandidate[] = [];
  const errors: string[] = [];
  const scannedLocations: string[] = [];
  let rateLimited = false;

  outer: for (const location of locations) {
    // Paginate up to 200 results per location (Yelp max with offset)
    for (let offset = 0; offset < 200; offset += 50) {
      let page: Awaited<ReturnType<typeof yelpSearch>>;
      try {
        page = await yelpSearch({ categories: KBBQ_CATEGORY, location, offset: String(offset), sort_by: "review_count" });
      } catch (e) {
        // 429 — keep everything scanned so far; the caller saves partial results
        // to the cache and the UI tells the user which locations remain.
        if (e instanceof YelpRateLimitError) {
          rateLimited = true;
          errors.push(`${location}: Yelp rate limit reached${e.resetTime ? ` (resets ${e.resetTime})` : ""}`);
          break outer;
        }
        throw e;
      }

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
    scannedLocations.push(location);
  }

  return { candidates, totalScanned: seen.size, errors, scannedLocations, rateLimited };
}

function bizToCandidate(biz: YelpBizLite, known: ReturnType<typeof buildKnownSet>, zipMap: Record<string, string> = DEFAULT_ZIP_MAP): DiscoverCandidate {
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
  // Exact-match batch keys so the client can drive chunked scans (5-ish locations per
  // request) without tripping Vercel's function timeout on the full 27-location sweep.
  const requested = (locationParam ?? "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const selectedLocations = forceRefresh && requested.length
    ? LOCATIONS.filter((l) => requested.includes(l.toLowerCase()))
    : LOCATIONS;

  try {
    // Build the known-restaurant set (non-fatal — if KV is down, use base JSON only)
    const base = baseRestaurants as Restaurant[];
    let kv: Restaurant[] = [];
    try {
      kv = (await getKVRestaurants()) as unknown as Restaurant[];
    } catch { /* KV unavailable */ }
    const known = buildKnownSet([...base, ...kv]);

    // Load the editable zip→neighborhood map (saved KV map or seed; non-fatal)
    const zipMap = await getZipMap();

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

    // Yelp scan over the selected batch
    const { candidates: fresh, totalScanned, errors, scannedLocations, rateLimited } =
      await runDiscovery(known, zipMap, selectedLocations);
    const merged = mergeWithCache(cache?.candidates ?? [], fresh);

    const newCache: DiscoverCache = {
      candidates: merged,
      lastFetched: new Date().toISOString(),
      totalScanned,
    };

    try {
      // 30-day TTL so a multi-day sweep (rate-limit pauses) never loses progress.
      // Upstash caps a request at ~1 MB — log the payload size so growth is visible.
      const kb = Math.round(JSON.stringify(newCache).length / 1024);
      console.log(`[yelp-discover] saving cache: ${merged.length} candidates, ~${kb} KB`);
      await redis.set(CACHE_KEY, newCache, { ex: 60 * 60 * 24 * 30 });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      candidates: merged,
      totalScanned,
      newCount: merged.filter((c) => !c.already_tracked && !c.is_closed).length,
      errors: errors.length ? errors : undefined,
      fromCache: false,
      lastFetched: newCache.lastFetched,
      scannedLocations,
      rateLimited: rateLimited || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[yelp-discover]", message);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}
