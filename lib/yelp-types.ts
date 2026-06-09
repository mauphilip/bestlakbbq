// Shared types for Yelp discover and sync — used by both API routes and client components

export interface DiscoverCandidate {
  id?: string;
  yelp_id: string;
  name?: string;
  neighborhood?: string;
  ayce?: boolean;
  ayce_tiers?: { label: string; price: number }[];
  non_ayce_est_per_person?: number | null;
  price_tier?: string;
  price_verified?: boolean;
  yelp_rating?: number;
  google_rating?: number;
  review_count?: number;
  yelp_url?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  last_price_check?: string;
  last_yelp_sync?: string;
  kv_managed?: boolean;
  // Discover-specific
  already_tracked: boolean;
  image_url?: string;
  is_closed: boolean;
  kbbq_confidence: "high" | "medium" | "low";
  categories_raw: string[];
}

export interface DiscoverCache {
  candidates: DiscoverCandidate[];
  lastFetched: string;
  totalScanned: number;
}

export interface RestaurantDiff {
  id: string;
  name: string;
  neighborhood: string;
  yelp_id: string | null;
  yelp_url: string;
  current: {
    rating: number;
    review_count: number;
    price_tier: string | null;
    yelp_url: string;
  };
  yelp: {
    rating: number;
    review_count: number;
    price_tier: string | null;
    yelp_url: string;
    is_closed: boolean;
    categories: string[]; // Yelp category aliases e.g. ["koreanbbq", "korean"]
  } | null;
  changes: {
    field: string;
    label: string;
    old: string | number | boolean | null;
    new: string | number | boolean | null;
  }[];
  now_closed: boolean;
  error?: string;
}
