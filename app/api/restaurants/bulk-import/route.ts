import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import { candidateToRestaurant } from "@/lib/yelp-shared";
import { sanitizeRestaurant } from "@/lib/validate";
import type { Restaurant } from "@/lib/types";
import type { DiscoverCache } from "@/lib/yelp-types";

const CACHE_KEY = "kbbq_discover_cache";
const MAX_BATCH = 500;

// POST /api/restaurants/bulk-import — { yelp_ids: string[] }
// Imports discover-cache candidates into KV in one pipeline (0 Yelp API calls).
// Skips already-tracked and closed candidates; marks imported ones tracked in the cache.
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const yelpIds: unknown = body?.yelp_ids;
  if (!Array.isArray(yelpIds) || !yelpIds.length || !yelpIds.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "yelp_ids must be a non-empty string array" }, { status: 400 });
  }
  if (yelpIds.length > MAX_BATCH) {
    return NextResponse.json({ error: `Max ${MAX_BATCH} ids per request` }, { status: 400 });
  }

  try {
    const cache = await redis.get<DiscoverCache>(CACHE_KEY);
    if (!cache?.candidates?.length) {
      return NextResponse.json({ error: "No discover cache — run a Yelp scan first" }, { status: 400 });
    }

    const byId = new Map(cache.candidates.map((c) => [c.yelp_id, c]));
    const now = new Date().toISOString();
    const imported: Restaurant[] = [];
    const skipped: { yelp_id: string; reason: string }[] = [];

    for (const yelpId of yelpIds as string[]) {
      const c = byId.get(yelpId);
      if (!c) { skipped.push({ yelp_id: yelpId, reason: "not in discover cache" }); continue; }
      if (c.already_tracked) { skipped.push({ yelp_id: yelpId, reason: "already tracked" }); continue; }
      if (c.is_closed) { skipped.push({ yelp_id: yelpId, reason: "closed on Yelp" }); continue; }

      const sanitized = sanitizeRestaurant(candidateToRestaurant(c, now));
      if (!sanitized.ok) { skipped.push({ yelp_id: yelpId, reason: sanitized.error }); continue; }
      imported.push({ ...sanitized.value, kv_managed: true } as Restaurant);
    }

    if (imported.length) {
      const pipeline = redis.pipeline();
      for (const r of imported) {
        pipeline.set(`${KV_RESTAURANT_PREFIX}${r.id}`, r);
      }
      await pipeline.exec();

      // Mark imported candidates as tracked so re-opens of the panel reflect reality
      const importedIds = new Set(imported.map((r) => r.yelp_id));
      const updated = cache.candidates.map((c) =>
        importedIds.has(c.yelp_id) ? { ...c, already_tracked: true } : c
      );
      try {
        await redis.set(CACHE_KEY, { ...cache, candidates: updated }, { ex: 60 * 60 * 24 * 30 });
      } catch { /* non-fatal — already_tracked is recomputed on cache reads anyway */ }
    }

    return NextResponse.json({
      imported: imported.length,
      skipped: skipped.length ? skipped : undefined,
      restaurants: imported,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bulk-import]", message);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}
