import { NextRequest, NextResponse } from "next/server";
import { redis, KV_VISIT_PREFIX, getKVVisits } from "@/lib/kv";

// GET /api/visits — all visits
export async function GET() {
  const visits = await getKVVisits();
  return NextResponse.json(visits);
}

// POST /api/visits — save or update a visit
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }
  const key = `${KV_VISIT_PREFIX}${body.restaurantId}`;
  const existing = await redis.get<Record<string, unknown>>(key) ?? {};
  const visit = {
    ...existing,
    ...body,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(key, visit);
  return NextResponse.json({ ok: true, visit });
}
