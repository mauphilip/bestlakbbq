import { NextRequest, NextResponse } from "next/server";
import { redis, KV_RESTAURANT_PREFIX, getKVRestaurants } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

// GET /api/restaurants — base JSON merged with KV overrides (KV wins on same ID)
export async function GET() {
  const kvRestaurants = await getKVRestaurants() as unknown as Restaurant[];
  const kvIds = new Set(kvRestaurants.map((r) => r.id));

  // Base restaurants not overridden in KV
  const base = (baseRestaurants as Restaurant[]).filter((r) => !kvIds.has(r.id));

  // Merge: KV overrides take precedence for any restaurant with same ID
  const baseWithKvDefaults = (baseRestaurants as Restaurant[])
    .filter((r) => kvIds.has(r.id))
    .map((r) => {
      const kv = kvRestaurants.find((k) => k.id === r.id)!;
      return { ...r, ...kv }; // KV fields win
    });

  // Pure KV-only restaurants (new additions not in base JSON)
  const baseIds = new Set((baseRestaurants as Restaurant[]).map((r) => r.id));
  const kvOnly = kvRestaurants.filter((r) => !baseIds.has(r.id));

  const all = [...base, ...baseWithKvDefaults, ...kvOnly];
  return NextResponse.json(all);
}

// POST /api/restaurants — add new OR override existing restaurant in KV (admin only)
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (!body.id || !body.name) {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }
  const key = `${KV_RESTAURANT_PREFIX}${body.id}`;
  await redis.set(key, { ...body, kv_managed: true, added_at: body.added_at ?? new Date().toISOString() });
  return NextResponse.json({ ok: true, id: body.id });
}
