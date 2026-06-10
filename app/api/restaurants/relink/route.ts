import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import { getAllRestaurants } from "@/lib/getRestaurants";
import { slugFromUrl, getYelpId, KBBQ_CATEGORY, type YelpBizLite } from "@/lib/yelp-shared";
import { yelpSearch, hasYelpKey } from "@/lib/yelp-server";
import type { Restaurant } from "@/lib/types";

// Re-link restaurants to their REAL Yelp business by searching Yelp by name.
// Fixes guessed/stale yelp_url slugs that 404 (breaking chart links + sync).
// POST { dryRun?: boolean, ids?: string[], minScore?: number }
//   dryRun (default true) → returns proposed corrections, writes nothing
//   dryRun:false          → writes CONFIDENT corrections to KV

const STOP = new Set(["bbq", "kbbq", "korean", "the", "los", "angeles", "restaurant", "house", "grill"]);
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function tokenize(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
}
function matchScore(name: string, bizName: string): number {
  const a = tokenize(name), b = tokenize(bizName);
  if (a.size === 0) return norm(bizName).includes(norm(name)) ? 1 : 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasYelpKey()) return NextResponse.json({ error: "YELP_API_KEY not set" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // default true (safe)
  const minScore: number = body.minScore ?? 0.67;
  const ids: string[] | undefined = body.ids;

  // Canonical set = base JSON merged with KV overrides (KV wins), minus deletes
  // Same merged set the sync/closure checks use: base + KV overrides + KV-only
  // additions, minus soft-deleted. (Previously this only looped base JSON, so
  // admin-added restaurants with no Yelp ID never appeared here.)
  let list: Restaurant[] = await getAllRestaurants();
  if (ids?.length) list = list.filter((r) => ids.includes(r.id));

  const results: Array<Record<string, unknown>> = [];
  let applied = 0, confidentCount = 0, weak = 0, noMatch = 0, same = 0;

  for (const r of list) {
    const { businesses } = await yelpSearch({
      term: r.name,
      location: `${r.neighborhood}, CA`,
      categories: KBBQ_CATEGORY,
      limit: "5",
    });
    await delay(150);

    const ranked = businesses
      .map((b: YelpBizLite) => ({ b, score: matchScore(r.name, b.name) }))
      .sort((x, y) => y.score - x.score);
    const top = ranked[0];
    const curSlug = slugFromUrl(r.yelp_url);
    const curId = getYelpId(r); // yelp_id if present, else url slug — the canonical "is it linked" value

    if (!top || top.score < 0.34) {
      // Already linked but the name search was inconclusive → leave it alone ("same"),
      // don't flag it as a no-match that needs attention. Only truly unlinked + unfound → no_match.
      if (curId) {
        same++;
        results.push({ id: r.id, name: r.name, status: "same", cur_slug: curSlug, cur_id: curId, new_slug: curSlug, score: top?.score ?? 0 });
      } else {
        noMatch++;
        results.push({ id: r.id, name: r.name, status: "no_match", cur_slug: curSlug, cur_id: curId, new_slug: null, score: top?.score ?? 0 });
      }
      continue;
    }

    const newSlug = slugFromUrl(top.b.url) ?? top.b.id;
    const changed = newSlug !== curSlug;
    const confidence = top.score >= minScore ? "confident" : "weak";
    if (!changed) same++;
    else if (confidence === "confident") confidentCount++;
    else weak++;

    const willApply = !dryRun && changed && confidence === "confident";
    if (willApply) {
      const key = `${KV_RESTAURANT_PREFIX}${r.id}`;
      const current = (await redis.get<Record<string, unknown>>(key)) ?? {};
      await redis.set(key, {
        ...r, ...current, id: r.id,
        yelp_id: top.b.id,
        yelp_url: (top.b.url || "").split("?")[0],
        yelp_rating: top.b.rating ?? r.yelp_rating,
        review_count: top.b.review_count ?? r.review_count,
        price_tier: top.b.price ?? current.price_tier ?? r.price_tier,
        last_yelp_sync: new Date().toISOString(),
        kv_managed: true,
      });
      applied++;
    }

    results.push({
      id: r.id, name: r.name, status: changed ? confidence : "same",
      cur_slug: curSlug, cur_id: curId, new_slug: newSlug, match_name: top.b.name,
      score: Number(top.score.toFixed(2)),
      rating: top.b.rating, review_count: top.b.review_count,
      is_closed: !!top.b.is_closed, applied: willApply,
    });
  }

  return NextResponse.json({
    dryRun, total: list.length,
    summary: { confident: confidentCount, weak, noMatch, same, applied },
    results,
  });
}
