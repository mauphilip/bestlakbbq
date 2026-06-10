// SERVER-ONLY Yelp access. Reads YELP_API_KEY — must never be imported by a client component.
// (`server-only` isn't available in this Next version, so we guard at runtime instead.)
import type { YelpBizLite } from "@/lib/yelp-shared";

if (typeof window !== "undefined") {
  throw new Error("lib/yelp-server.ts is server-only and must not be imported in client code.");
}

const YELP_API = "https://api.yelp.com/v3";

export function hasYelpKey(): boolean {
  return !!process.env.YELP_API_KEY;
}

/** Thrown when Yelp returns 429 so callers can stop and surface a clear message.
 *  Carries Yelp's own retry/reset hints from the response headers. */
export class YelpRateLimitError extends Error {
  retryAfter: string | null;
  resetTime: string | null;
  dailyLimit: string | null;
  constructor(res?: Response) {
    super("YELP_RATE_LIMIT");
    this.name = "YelpRateLimitError";
    this.retryAfter = res?.headers.get("Retry-After") ?? null;
    this.resetTime = res?.headers.get("RateLimit-ResetTime") ?? null;
    this.dailyLimit = res?.headers.get("RateLimit-DailyLimit") ?? null;
  }
}

/** GET a Yelp API path (e.g. `/businesses/<id>`). Returns parsed JSON, null on 4xx/5xx,
 *  or throws YelpRateLimitError on 429. */
export async function yelpFetch(path: string): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetch(`${YELP_API}${path}`, {
      headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    });
  } catch {
    return null; // network error
  }
  if (res.status === 429) throw new YelpRateLimitError(res);
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

/** Yelp business search. Defaults limit=50; callers pass categories/location/offset/sort_by/limit. */
export async function yelpSearch(
  params: Record<string, string>
): Promise<{ businesses: YelpBizLite[]; total: number; error?: string }> {
  const qs = new URLSearchParams({ limit: "50", ...params });
  try {
    const res = await fetch(`${YELP_API}/businesses/search?${qs}`, {
      headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    });
    if (res.status === 429) throw new YelpRateLimitError(res);
    const json = await res.json();
    if (!res.ok) return { businesses: [], total: 0, error: json.error?.description ?? `HTTP ${res.status}` };
    return { businesses: json.businesses ?? [], total: json.total ?? 0 };
  } catch (e) {
    if (e instanceof YelpRateLimitError) throw e;
    return { businesses: [], total: 0, error: String(e) };
  }
}
