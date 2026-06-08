import { NextRequest, NextResponse } from "next/server";

const YELP_BASE = "https://api.yelp.com/v3";
const ALLOWED_PATHS = [
  /^\/businesses\/search$/,
  /^\/businesses\/[^\s/?#]+$/,
];

export async function GET(req: NextRequest) {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "YELP_API_KEY not configured" }, { status: 500 });
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
