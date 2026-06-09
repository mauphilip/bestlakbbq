import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

const YELP_API = "https://api.yelp.com/v3";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface YelpSnapshot {
  rating: number;
  review_count: number;
  price_tier: string | null;
  yelp_url: string;
  is_closed: boolean;
}

export interface RestaurantDiff {
  id: string;
  name: string;
  neighborhood: string;
  yelp_id: string | null;
  yelp_url: string;
  current: {
    rating: number;
    review_count: number;
    price_tier: string | null;
    yelp_url: string;
  };
  yelp: YelpSnapshot | null; // null = could not fetch
  changes: {
    field: string;
    label: string;
    old: string | number | boolean | null;
    new: string | number | boolean | null;
  }[];
  now_closed: boolean;
  error?: string;
}

async function fetchYelpBiz(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${YELP_API}/businesses/${id}`, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function getYelpId(r: Restaurant): string | null {
  if (r.yelp_id) return r.yelp_id;
  const match = r.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/);
  return match?.[1] ?? null;
}

// POST /api/restaurants/yelp-check
// Body: { ids?: string[] } — check specific restaurants, or all if omitted
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.YELP_API_KEY) {
    return NextResponse.json({ error: "YELP_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const filterIds: string[] = body.ids ?? [];

  let base: Restaurant[] = [];
  let kv: Restaurant[] = [];
  try {
    base = baseRestaurants as Restaurant[];
    kv = (await getKVRestaurants()) as unknown as Restaurant[];
  } catch (e) {
    return NextResponse.json({ error: `DB error: ${e}` }, { status: 500 });
  }

  let all = [...base, ...kv];
  if (filterIds.length) {
    all = all.filter((r) => filterIds.includes(r.id));
  }

  const results: RestaurantDiff[] = [];

  for (const r of all) {
    const yid = getYelpId(r);

    const current = {
      rating: r.yelp_rating,
      review_count: r.review_count,
      price_tier: r.price_tier ?? null,
      yelp_url: r.yelp_url ?? "",
    };

    if (!yid) {
      results.push({
        id: r.id, name: r.name, neighborhood: r.neighborhood,
        yelp_id: null, yelp_url: r.yelp_url ?? "",
        current, yelp: null, changes: [], now_closed: false,
        error: "No Yelp ID — run Sync from Yelp first",
      });
      continue;
    }

    try {
      const biz = await fetchYelpBiz(yid);
      await delay(250);

      if (!biz) {
        results.push({
          id: r.id, name: r.name, neighborhood: r.neighborhood,
          yelp_id: yid, yelp_url: r.yelp_url ?? "",
          current, yelp: null, changes: [], now_closed: false,
          error: "Yelp returned no data (may have been removed)",
        });
        continue;
      }

      const isClosed = !!(biz.is_closed);
      const yelpRating = biz.rating as number ?? null;
      const yelpReviews = biz.review_count as number ?? null;
      const yelpPrice = biz.price as string ?? null;
      const yelpUrl = (biz.url as string)?.split("?")[0] ?? null;

      const yelp: YelpSnapshot = {
        rating: yelpRating,
        review_count: yelpReviews,
        price_tier: yelpPrice,
        yelp_url: yelpUrl ?? r.yelp_url ?? "",
        is_closed: isClosed,
      };

      const changes: RestaurantDiff["changes"] = [];

      if (isClosed) {
        changes.push({ field: "is_closed", label: "Status", old: "Open", new: "Permanently Closed" });
      }
      if (yelpRating !== null && Math.abs(yelpRating - r.yelp_rating) >= 0.1) {
        changes.push({ field: "yelp_rating", label: "Rating", old: r.yelp_rating, new: yelpRating });
      }
      if (yelpReviews !== null && yelpReviews !== r.review_count) {
        changes.push({ field: "review_count", label: "Reviews", old: r.review_count, new: yelpReviews });
      }
      if (yelpPrice && yelpPrice !== (r.price_tier ?? null)) {
        changes.push({ field: "price_tier", label: "Price Tier", old: r.price_tier ?? "—", new: yelpPrice });
      }
      if (yelpUrl && r.yelp_url && yelpUrl !== r.yelp_url.split("?")[0]) {
        changes.push({ field: "yelp_url", label: "Yelp URL", old: r.yelp_url, new: yelpUrl });
      }

      results.push({
        id: r.id, name: r.name, neighborhood: r.neighborhood,
        yelp_id: yid, yelp_url: r.yelp_url ?? "",
        current, yelp, changes, now_closed: isClosed,
      });
    } catch (e) {
      results.push({
        id: r.id, name: r.name, neighborhood: r.neighborhood,
        yelp_id: yid, yelp_url: r.yelp_url ?? "",
        current, yelp: null, changes: [], now_closed: false, error: String(e),
      });
    }
  }

  // Sort: closed first, then changed, then up-to-date
  results.sort((a, b) => {
    if (a.now_closed !== b.now_closed) return a.now_closed ? -1 : 1;
    if ((a.changes.length > 0) !== (b.changes.length > 0)) return a.changes.length > 0 ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    results,
    closedCount: results.filter((r) => r.now_closed).length,
    changedCount: results.filter((r) => r.changes.length > 0 && !r.now_closed).length,
    upToDateCount: results.filter((r) => r.changes.length === 0 && !r.now_closed && !r.error).length,
    errorCount: results.filter((r) => r.error).length,
    total: results.length,
  });
}

// Keep GET for backward compat — delegates to POST logic
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Wrap as POST-style call with no filter
  const fakeReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({}),
  });
  return POST(fakeReq);
}
