import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import { getYelpId, KBBQ_CATEGORY, type YelpBizLite } from "@/lib/yelp-shared";
import { yelpSearch, hasYelpKey } from "@/lib/yelp-server";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface LinkCandidate {
  yelp_id: string; name: string; url: string; rating: number;
  review_count: number; address: string; categories: string[];
}

async function searchYelp(name: string, location: string): Promise<LinkCandidate[]> {
  const { businesses } = await yelpSearch({
    term: name,
    location,
    categories: KBBQ_CATEGORY,
    limit: "5",
  });
  return businesses.map((b: YelpBizLite) => ({
    yelp_id: b.id,
    name: b.name,
    url: (b.url ?? "").split("?")[0],
    rating: b.rating ?? 0,
    review_count: b.review_count ?? 0,
    address: `${b.location?.address1 ?? ""}, ${b.location?.city ?? ""}`,
    categories: (b.categories ?? []).map((c) => c.alias),
  }));
}

// POST /api/restaurants/yelp-link
// body: { mode: "scan" }                       → search Yelp for each unlinked restaurant
// body: { mode: "search", term, location }     → single search, return ≤5 candidates (for the form)
// body: { id, yelp_id, yelp_url }              → save the link to KV
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasYelpKey()) {
    return NextResponse.json({ error: "YELP_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));

  // ── Single search (form "Find on Yelp") ──
  if (body.mode === "search" && body.term) {
    const location = body.location
      ? `${body.location}, Los Angeles, CA`
      : "Los Angeles, CA";
    const candidates = await searchYelp(body.term as string, location);
    return NextResponse.json({ candidates });
  }

  // ── Save a link ──
  if (body.id && body.yelp_id) {
    const base = baseRestaurants as Restaurant[];
    let kv: Restaurant[] = [];
    try { kv = await getKVRestaurants() as unknown as Restaurant[]; } catch { /* ignore */ }
    const existing = [...base, ...kv].find((r) => r.id === body.id);
    if (!existing) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    const key = `${KV_RESTAURANT_PREFIX}${body.id}`;
    const current = await redis.get<Record<string, unknown>>(key) ?? {};
    await redis.set(key, {
      ...existing, ...current,
      id: body.id,
      yelp_id: body.yelp_id,
      yelp_url: body.yelp_url ?? existing.yelp_url ?? "",
      kv_managed: true,
      last_yelp_sync: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  }

  // ── Scan mode: find unlinked restaurants and search Yelp for each ──
  const base = baseRestaurants as Restaurant[];
  let kv: Restaurant[] = [];
  try { kv = await getKVRestaurants() as unknown as Restaurant[]; } catch { /* ignore */ }
  const all = [...base, ...kv].filter((r) => !r.is_deleted);
  const unlinked = all.filter((r) => !getYelpId(r));

  const results: Array<{
    id: string;
    name: string;
    neighborhood: string;
    yelp_url: string;
    candidates: Array<{
      yelp_id: string; name: string; url: string; rating: number;
      review_count: number; address: string; categories: string[];
    }>;
  }> = [];

  for (const r of unlinked) {
    const candidates = await searchYelp(r.name, `${r.neighborhood}, Los Angeles, CA`);
    await delay(120);
    results.push({
      id: r.id,
      name: r.name,
      neighborhood: r.neighborhood,
      yelp_url: r.yelp_url ?? "",
      candidates,
    });
  }

  return NextResponse.json({ results, count: unlinked.length });
}
