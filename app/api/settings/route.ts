import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { redis } from "@/lib/kv";
import { SETTINGS_KEY, DEFAULT_SETTINGS, getSettings, type SiteSettings } from "@/lib/settings";

// GET /api/settings — public (the list page partitions on these thresholds)
export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

// PUT /api/settings — update thresholds (admin only)
export async function PUT(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "body must be an object" }, { status: 400 });
  }

  const current = await getSettings();
  const next: SiteSettings = { ...current };

  if (body.min_rating !== undefined) {
    const v = Number(body.min_rating);
    if (!Number.isFinite(v) || v < 0 || v > 5) {
      return NextResponse.json({ error: "min_rating must be between 0 and 5" }, { status: 400 });
    }
    next.min_rating = Math.round(v * 10) / 10; // Yelp ratings have one decimal
  }
  if (body.min_review_count !== undefined) {
    const v = Number(body.min_review_count);
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000) {
      return NextResponse.json({ error: "min_review_count must be a non-negative integer" }, { status: 400 });
    }
    next.min_review_count = v;
  }

  await redis.set(SETTINGS_KEY, next);
  return NextResponse.json({ ...next, defaults: DEFAULT_SETTINGS });
}
