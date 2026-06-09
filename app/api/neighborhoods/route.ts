import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { redis } from "@/lib/kv";

const KV_KEY = "kbbq_neighborhood_overrides";

export async function GET() {
  try {
    const overrides = await redis.get<Record<string, string>>(KV_KEY);
    return NextResponse.json({ overrides: overrides ?? {} });
  } catch {
    return NextResponse.json({ overrides: {} });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();

    let overrides: Record<string, string>;

    if (body.overrides && typeof body.overrides === "object") {
      // Bulk replace
      overrides = body.overrides as Record<string, string>;
    } else if (typeof body.zip === "string" && typeof body.neighborhood === "string") {
      // Single upsert — merge with existing
      let existing: Record<string, string> = {};
      try {
        existing = (await redis.get<Record<string, string>>(KV_KEY)) ?? {};
      } catch { /* non-fatal */ }
      overrides = { ...existing, [body.zip]: body.neighborhood };
    } else {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await redis.set(KV_KEY, overrides);
    return NextResponse.json({ overrides });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (typeof body.zip !== "string") {
      return NextResponse.json({ error: "zip required" }, { status: 400 });
    }
    let existing: Record<string, string> = {};
    try {
      existing = (await redis.get<Record<string, string>>(KV_KEY)) ?? {};
    } catch { /* non-fatal */ }
    const updated = { ...existing };
    delete updated[body.zip];
    await redis.set(KV_KEY, updated);
    return NextResponse.json({ overrides: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
