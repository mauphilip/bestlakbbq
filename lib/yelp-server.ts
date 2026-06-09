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

/** GET a Yelp API path (e.g. `/businesses/<id>`). Returns parsed JSON, or null on non-OK/error. */
export async function yelpFetch(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${YELP_API}${path}`, {
      headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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
    const json = await res.json();
    if (!res.ok) return { businesses: [], total: 0, error: json.error?.description ?? `HTTP ${res.status}` };
    return { businesses: json.businesses ?? [], total: json.total ?? 0 };
  } catch (e) {
    return { businesses: [], total: 0, error: String(e) };
  }
}
