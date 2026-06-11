import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";

const YELP_BASE = "https://api.yelp.com/v3";
const ALLOWED_PATHS = [
  /^\/businesses\/search$/,
  /^\/businesses\/[^\s/?#]+$/,
];

export async function GET(req: NextRequest) {
  // Admin-only: every proxied call spends Yelp API quota
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const path = searchParams.get("path") ?? "";

  if (!ALLOWED_PATHS.some((r) => r.test(path))) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 400 });
  }

  // Forward remaining query params
  const params = new URLSearchParams(searchParams);
  params.delete("path");
  const url = `${YELP_BASE}${path}${params.size ? "?" + params.toString() : ""}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 300 }, // 5-min cache
  });

  const data = await resp.json();

  const response = NextResponse.json(data, { status: resp.status });
  // Pass through rate limit headers
  ["RateLimit-DailyLimit", "RateLimit-Remaining", "RateLimit-ResetTime"].forEach((h) => {
    const v = resp.headers.get(h);
    if (v) response.headers.set(h, v);
  });
  return response;
}
