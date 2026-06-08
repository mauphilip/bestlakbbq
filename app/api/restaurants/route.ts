import { NextRequest, NextResponse } from "next/server";
import { redis, KV_RESTAURANT_PREFIX, getKVRestaurants } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

// GET /api/restaurants — base JSON + KV additions merged
export async function GET() {
  const kvRestaurants = await getKVRestaurants();
  const all = [...(baseRestaurants as Restaurant[]), ...kvRestaurants] as Restaurant[];
  return NextResponse.json(all);
}

// POST /api/restaurants — add new restaurant to KV (admin only)
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (!body.id || !body.name) {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }
  const key = `${KV_RESTAURANT_PREFIX}${body.id}`;
  await redis.set(key, { ...body, kv_managed: true, added_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, id: body.id });
}
