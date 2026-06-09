import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getKVRestaurants, redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

const YELP_API = "https://api.yelp.com/v3";

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function getYelpId(r: Restaurant): string | null {
  if (r.yelp_id) return r.yelp_id;
  const m = r.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/);
  return m?.[1] ?? null;
}

async function searchYelp(name: string, neighborhood: string) {
  const qs = new URLSearchParams({
    term: name,
    location: `${neighborhood}, Los Angeles, CA`,
    categories: "korean,koreanbbq",
    limit: "5",
  });
  const res = await fetch(`${YELP_API}/businesses/search?${qs}`, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.businesses ?? []) as Array<{
    id: string; name: string; url: string; rating: number; review_count: number;
    location: { address1: string; city: string };
    categories: { alias: string; title: string }[];
  }>;
}

// POST /api/restaurants/yelp-link
// body: { mode: "scan" }  → search Yelp for each unlinked restaurant, return candidates
// body: { id: string, yelp_id: string, yelp_url: string }  → save the link to KV
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.YELP_API_KEY) {
    return NextResponse.json({ error: "YELP_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));

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
    const bizzes = await searchYelp(r.name, r.neighborhood);
    await delay(120);
    results.push({
      id: r.id,
      name: r.name,
      neighborhood: r.neighborhood,
      yelp_url: r.yelp_url ?? "",
      candidates: bizzes.map((b) => ({
        yelp_id: b.id,
        name: b.name,
        url: b.url.split("?")[0],
        rating: b.rating,
        review_count: b.review_count,
        address: `${b.location.address1}, ${b.location.city}`,
        categories: b.categories.map((c) => c.alias),
      })),
    });
  }

  return NextResponse.json({ results, count: unlinked.length });
}
