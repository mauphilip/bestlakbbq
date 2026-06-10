import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";

// Live Yelp connection + rate-limit status. Makes one minimal, uncached Yelp call
// and reads Yelp's RateLimit-* response headers.
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.YELP_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "YELP_API_KEY is not set in this environment." }, { status: 500 });
  }

  try {
    const res = await fetch(
      "https://api.yelp.com/v3/businesses/search?location=Los+Angeles,+CA&categories=koreanbbq&limit=1",
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    const dailyLimit = res.headers.get("RateLimit-DailyLimit");
    const remaining = res.headers.get("RateLimit-Remaining");
    const resetTime = res.headers.get("RateLimit-ResetTime");

    if (res.status === 429) {
      return NextResponse.json({
        ok: false, rateLimited: true,
        retryAfter: res.headers.get("Retry-After"),
        dailyLimit, remaining, resetTime, updated: Date.now(),
      });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: false, error: body?.error?.description ?? `Yelp HTTP ${res.status}`,
        dailyLimit, remaining, resetTime, updated: Date.now(),
      });
    }
    return NextResponse.json({ ok: true, dailyLimit, remaining, resetTime, updated: Date.now() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Couldn't reach Yelp: ${String(e)}` }, { status: 502 });
  }
}
