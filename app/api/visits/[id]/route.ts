import { NextRequest, NextResponse } from "next/server";
import { redis, KV_VISIT_PREFIX } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import { RESTAURANT_ID_RE } from "@/lib/validate";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!RESTAURANT_ID_RE.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await redis.del(`${KV_VISIT_PREFIX}${id}`);
  return NextResponse.json({ ok: true });
}
