import { NextRequest, NextResponse } from "next/server";
import { redis, KV_RESTAURANT_PREFIX, getKVRestaurants } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant, PriceTier } from "@/lib/types";

const YELP_API = "https://api.yelp.com/v3";

async function yelpFetch(path: string) {
  const res = await fetch(`${YELP_API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Extract Yelp business ID from a yelp.com URL */
function yelpIdFromUrl(url: string): string | null {
  const match = url.match(/yelp\.com\/biz\/([^?#/]+)/);
  return match ? match[1] : null;
}

interface YelpBusiness {
  id: string;
  rating: number;
  review_count: number;
  price?: string;
  url?: string;
}

async function fetchYelpData(restaurant: Restaurant): Promise<YelpBusiness | null> {
  // Prefer lookup by Yelp URL slug (most reliable)
  const slug = restaurant.yelp_url ? yelpIdFromUrl(restaurant.yelp_url) : null;
  if (slug) {
    const data = await yelpFetch(`/businesses/${slug}`);
    if (data?.id) return data;
  }

  // Fallback: search by name + location
  const params = new URLSearchParams({
    term: restaurant.name,
    location: `${restaurant.neighborhood}, Los Angeles, CA`,
    limit: "1",
    categories: "koreanbbq",
  });
  const results = await yelpFetch(`/businesses/search?${params}`);
  return results?.businesses?.[0] ?? null;
}

// POST /api/restaurants/refresh — bulk sync ratings + price tier from Yelp
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = body.ids; // optional: only refresh specific IDs

  const kvRestaurants = await getKVRestaurants() as unknown as Restaurant[];
  const kvMap = new Map(kvRestaurants.map((r) => [r.id, r]));

  const allBase = baseRestaurants as Restaurant[];
  const toRefresh = ids
    ? allBase.filter((r) => ids.includes(r.id))
    : allBase;

  const results: { id: string; name: string; status: string; changes?: object }[] = [];

  for (const base of toRefresh) {
    try {
      const yelp = await fetchYelpData(base);
      if (!yelp) {
        results.push({ id: base.id, name: base.name, status: "not_found" });
        continue;
      }

      const existing = kvMap.get(base.id) ?? {};
      const updates: Partial<Restaurant> = {
        ...existing,
        id: base.id,
        yelp_rating: yelp.rating,
        review_count: yelp.review_count,
        last_yelp_sync: new Date().toISOString(),
        kv_managed: true,
      };

      if (yelp.price) {
        updates.price_tier = yelp.price as PriceTier;
      }
      if (yelp.url && !base.yelp_url) {
        updates.yelp_url = yelp.url;
      }
      if (yelp.id) {
        updates.yelp_id = yelp.id;
      }

      await redis.set(`${KV_RESTAURANT_PREFIX}${base.id}`, updates);
      results.push({
        id: base.id,
        name: base.name,
        status: "updated",
        changes: {
          yelp_rating: yelp.rating,
          review_count: yelp.review_count,
          price_tier: yelp.price,
        },
      });

      // Small delay to avoid Yelp rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      results.push({ id: base.id, name: base.name, status: "error" });
    }
  }

  const updated = results.filter((r) => r.status === "updated").length;
  const notFound = results.filter((r) => r.status === "not_found").length;

  return NextResponse.json({ ok: true, updated, notFound, results });
}
