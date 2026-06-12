import { NextRequest, NextResponse } from "next/server";
import { redis, KV_VISIT_PREFIX, getKVVisits } from "@/lib/kv";
import { verifyAdminToken } from "@/lib/auth";
import { sanitizeVisit } from "@/lib/validate";

// GET /api/visits — all visits (public; it's a read-only personal log)
export async function GET() {
  const visits = await getKVVisits();
  return NextResponse.json(visits);
}

// POST /api/visits — save or update a visit (owner only)
export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const sanitized = sanitizeVisit(body);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }
  const key = `${KV_VISIT_PREFIX}${sanitized.value.restaurantId}`;
  const existing = await redis.get<Record<string, unknown>>(key) ?? {};
  const visit = {
    ...existing,
    ...sanitized.value,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(key, visit);
  return NextResponse.json({ ok: true, visit });
}
