import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { getAllRestaurants } from "@/lib/getRestaurants";
import { getYelpId, slugFromUrl } from "@/lib/yelp-shared";
import { yelpFetch } from "@/lib/yelp-server";
import type { Restaurant } from "@/lib/types";
import type { RestaurantDiff } from "@/lib/yelp-types";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const fetchYelpBiz = (id: string) => yelpFetch(`/businesses/${id}`);

type CheckMode = "closed" | "updates";

async function checkAll(restaurants: Restaurant[], mode: CheckMode): Promise<RestaurantDiff[]> {
  const results: RestaurantDiff[] = [];

  for (const r of restaurants) {
    const yid = getYelpId(r);
    const current = {
      rating: r.yelp_rating ?? 0,
      review_count: r.review_count ?? 0,
      price_tier: r.price_tier ?? null,
      yelp_url: r.yelp_url ?? "",
    };

    if (!yid) {
      // Only surface "no Yelp ID" errors in updates mode — not relevant for closure check
      if (mode === "updates") {
        results.push({
          id: r.id ?? "", name: r.name ?? "", neighborhood: r.neighborhood ?? "",
          yelp_id: null, yelp_url: r.yelp_url ?? "",
          current, yelp: null, changes: [], now_closed: false,
          error: "No Yelp ID",
        });
      }
      continue;
    }

    // Fetch by the stored id; if that's dead (e.g. a stale yelp_id left behind
    // after the URL was changed), fall back to the slug from the Yelp URL.
    const urlSlug = slugFromUrl(r.yelp_url);
    let biz = await fetchYelpBiz(yid);
    await delay(100);
    if (!biz && urlSlug && urlSlug !== yid) {
      biz = await fetchYelpBiz(urlSlug);
      await delay(100);
    }

    if (!biz) {
      results.push({
        id: r.id ?? "", name: r.name ?? "", neighborhood: r.neighborhood ?? "",
        yelp_id: yid, yelp_url: r.yelp_url ?? "",
        current, yelp: null, changes: [], now_closed: false,
        error: "Yelp returned no data",
      });
      continue;
    }

    // The real business id Yelp resolved to (fixes a stale stored yelp_id on apply).
    const resolvedId = (biz.id as string) ?? yid;

    const isClosed = !!(biz.is_closed);
    const yelpRating = (biz.rating as number) ?? null;
    const yelpReviews = (biz.review_count as number) ?? null;
    const yelpPrice = (biz.price as string) ?? null;
    const yelpUrl = (biz.url as string)?.split("?")[0] ?? null;
    const categories = ((biz.categories as { alias: string; title: string }[]) ?? []).map((c) => c.alias);

    const yelpSnap = {
      rating: yelpRating,
      review_count: yelpReviews,
      price_tier: yelpPrice,
      yelp_url: yelpUrl ?? r.yelp_url ?? "",
      is_closed: isClosed,
      categories,
    };

    const changes: RestaurantDiff["changes"] = [];

    if (mode === "closed") {
      // Only care about closure status
      if (isClosed) {
        changes.push({ field: "is_closed", label: "Status", old: "Open", new: "Permanently Closed" });
        results.push({
          id: r.id ?? "", name: r.name ?? "", neighborhood: r.neighborhood ?? "",
          yelp_id: resolvedId, yelp_url: r.yelp_url ?? "",
          current, yelp: yelpSnap, changes, now_closed: true,
        });
      }
      // Skip open restaurants entirely in closed mode — nothing to report
    } else {
      // updates mode: check data fields, skip closure
      if (yelpRating !== null && Math.abs(yelpRating - (r.yelp_rating ?? 0)) >= 0.1) {
        changes.push({ field: "yelp_rating", label: "Rating", old: r.yelp_rating ?? 0, new: yelpRating });
      }
      if (yelpReviews !== null && yelpReviews !== (r.review_count ?? 0)) {
        changes.push({ field: "review_count", label: "Reviews", old: r.review_count ?? 0, new: yelpReviews });
      }
      if (yelpPrice && yelpPrice !== (r.price_tier ?? null)) {
        changes.push({ field: "price_tier", label: "Price Tier", old: r.price_tier ?? "—", new: yelpPrice });
      }
      if (yelpUrl && r.yelp_url && yelpUrl !== r.yelp_url.split("?")[0]) {
        changes.push({ field: "yelp_url", label: "Yelp URL", old: r.yelp_url, new: yelpUrl });
      }
      // Stored yelp_id is stale (pointed at a different business than the URL) — surface it so applying fixes it.
      if (r.yelp_id && r.yelp_id !== resolvedId) {
        changes.push({ field: "yelp_id", label: "Yelp link", old: r.yelp_id, new: resolvedId });
      }
      results.push({
        id: r.id ?? "", name: r.name ?? "", neighborhood: r.neighborhood ?? "",
        yelp_id: resolvedId, yelp_url: r.yelp_url ?? "",
        current, yelp: yelpSnap, changes, now_closed: false,
      });
    }
  }

  results.sort((a, b) => {
    if ((a.changes.length > 0) !== (b.changes.length > 0)) return a.changes.length > 0 ? -1 : 1;
    if (!!a.error !== !!b.error) return a.error ? 1 : -1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return results;
}

// POST /api/restaurants/yelp-check
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.YELP_API_KEY) {
    return NextResponse.json(
      { error: "YELP_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterIds: string[] = body.ids ?? [];
    const mode: CheckMode = body.mode === "closed" ? "closed" : "updates";

    // Merged base+KV list with KV overrides winning and soft-deleted rows removed
    // (so deleted restaurants are never re-checked/re-reported).
    let all = await getAllRestaurants();
    if (filterIds.length) all = all.filter((r) => filterIds.includes(r.id));

    const results = await checkAll(all, mode);

    return NextResponse.json({
      results,
      mode,
      closedCount: results.filter((r) => r.now_closed).length,
      changedCount: results.filter((r) => r.changes.length > 0 && !r.now_closed).length,
      upToDateCount: results.filter((r) => r.changes.length === 0 && !r.now_closed && !r.error).length,
      errorCount: results.filter((r) => r.error).length,
      total: results.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[yelp-check]", message);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}

// GET kept for backward compat
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST(new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({}),
  }));
}
