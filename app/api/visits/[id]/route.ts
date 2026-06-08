import { NextRequest, NextResponse } from "next/server";
import { redis, KV_VISIT_PREFIX } from "@/lib/kv";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await redis.del(`${KV_VISIT_PREFIX}${id}`);
  return NextResponse.json({ ok: true });
}
