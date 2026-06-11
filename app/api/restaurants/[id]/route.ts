import { NextRequest, NextResponse } from "next/server";
import { redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import { sanitizeRestaurant } from "@/lib/validate";
import baseRestaurants from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  // id comes from the URL — sanitize the body against it so partial updates stay whitelisted
  const sanitized = sanitizeRestaurant({ ...(body && typeof body === "object" ? body : {}), id });
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }
  const key = `${KV_RESTAURANT_PREFIX}${id}`;
  const existing = await redis.get<Record<string, unknown>>(key) ?? {};
  await redis.set(key, { ...existing, ...sanitized.value, id, updated_at: new Date().toISOString() });
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
