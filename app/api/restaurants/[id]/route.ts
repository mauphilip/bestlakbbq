import { NextRequest, NextResponse } from "next/server";
import { redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const key = `${KV_RESTAURANT_PREFIX}${id}`;
  const existing = await redis.get<Record<string, unknown>>(key) ?? {};
  await redis.set(key, { ...existing, ...body, id, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const key = `${KV_RESTAURANT_PREFIX}${id}`;
  const isBaseJson = (baseRestaurants as Restaurant[]).some((r) => r.id === id);
  if (isBaseJson) {
    // Soft-delete: write a KV override with is_deleted flag
    await redis.set(key, { id, is_deleted: true });
  } else {
    // Pure KV restaurant — hard delete
    await redis.del(key);
  }
  return NextResponse.json({ ok: true });
}
