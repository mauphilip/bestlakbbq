import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

const YELP_API = "https://api.yelp.com/v3";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RestaurantDiff {
  id: string;
  name: string;
  yelp_url: string;
  yelp_id?: string;
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

// Extract Yelp biz ID from a Yelp URL slug or use stored yelp_id
function getYelpId(r: Restaurant): string | null {
  if (r.yelp_id) return r.yelp_id;
  const match = r.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/);
  return match?.[1] ?? null;
}

// GET /api/restaurants/yelp-check
// Loops all tracked restaurants, fetches their Yelp data, returns diffs
// Optional: ?ids=id1,id2 to check specific restaurants only
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.YELP_API_KEY) {
    return NextResponse.json({ error: "YELP_API_KEY not configured" }, { status: 500 });
  }

  const filterIds = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];

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
    if (!yid) {
      results.push({
        id: r.id,
        name: r.name,
        yelp_url: r.yelp_url ?? "",
        changes: [],
        now_closed: false,
        error: "No Yelp ID — cannot check",
      });
      continue;
    }

    try {
      const biz = await fetchYelpBiz(yid);
      await delay(250); // respect Yelp rate limits

      if (!biz) {
        results.push({ id: r.id, name: r.name, yelp_url: r.yelp_url ?? "", changes: [], now_closed: false, error: "Yelp returned no data" });
        continue;
      }

      const changes: RestaurantDiff["changes"] = [];
      const isClosed = !!(biz.is_closed);

      if (isClosed) {
        changes.push({ field: "is_closed", label: "Status", old: "Open", new: "Permanently Closed" });
      }

      const yelpRating = (biz.rating as number) ?? null;
      if (yelpRating && Math.abs(yelpRating - r.yelp_rating) >= 0.1) {
        changes.push({ field: "yelp_rating", label: "Yelp Rating", old: r.yelp_rating, new: yelpRating });
      }

      const reviewCount = (biz.review_count as number) ?? null;
      if (reviewCount && reviewCount !== r.review_count) {
        changes.push({ field: "review_count", label: "Review Count", old: r.review_count, new: reviewCount });
      }

      const priceTier = (biz.price as string) ?? null;
      if (priceTier && priceTier !== r.price_tier) {
        changes.push({ field: "price_tier", label: "Yelp Price Tier", old: r.price_tier ?? "—", new: priceTier });
      }

      const newUrl = (biz.url as string)?.split("?")[0];
      const oldUrl = r.yelp_url?.split("?")[0];
      if (newUrl && oldUrl && newUrl !== oldUrl) {
        changes.push({ field: "yelp_url", label: "Yelp URL", old: oldUrl, new: newUrl });
      }

      results.push({
        id: r.id,
        name: r.name,
        yelp_url: r.yelp_url ?? "",
        yelp_id: yid,
        changes,
        now_closed: isClosed,
      });
    } catch (e) {
      results.push({ id: r.id, name: r.name, yelp_url: r.yelp_url ?? "", changes: [], now_closed: false, error: String(e) });
    }
  }

  const closedCount = results.filter((r) => r.now_closed).length;
  const changedCount = results.filter((r) => r.changes.length > 0).length;
  const errorCount = results.filter((r) => r.error).length;

  return NextResponse.json({ results, closedCount, changedCount, errorCount, total: results.length });
}
