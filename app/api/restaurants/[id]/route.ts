import { NextRequest, NextResponse } from "next/server";
import { redis, KV_RESTAURANT_PREFIX } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";

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
  await redis.del(`${KV_RESTAURANT_PREFIX}${id}`);
  return NextResponse.json({ ok: true });
}
