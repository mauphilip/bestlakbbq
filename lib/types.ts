export interface AyceTier {
  label: string;
  price: number;
}

/** Yelp price tier — remapped for KBBQ context */
export type PriceTier = "$" | "$$" | "$$$" | "$$$$";

export const KBBQ_PRICE_RANGES: Record<PriceTier, { low: number; high: number; label: string }> = {
  "$":    { low: 15, high: 20, label: "Under $20" },      // rare for KBBQ
  "$$":   { low: 20, high: 35, label: "$20–$35" },
  "$$$":  { low: 35, high: 55, label: "$35–$55" },
  "$$$$": { low: 55, high: 80, label: "$55+" },
};

export interface Restaurant {
  id: string;
  name: string;
  neighborhood: string;
  ayce: boolean;
  ayce_tiers: AyceTier[];
  non_ayce_est_per_person: number | null;
  /** Yelp price tier ($$, $$$, $$$$) — auto-synced from Yelp */
  price_tier?: PriceTier;
  /** True once you've manually confirmed the exact price */
  price_verified?: boolean;
  yelp_id?: string;
  yelp_rating: number;
  google_rating: number;
  review_count: number;
  last_price_check: string;
  /** ISO date of last Yelp sync */
  last_yelp_sync?: string;
  lat: number;
  lng: number;
  yelp_url: string;
  notes: string;
  /** True if this record was added/edited via admin (stored in KV) */
  kv_managed?: boolean;
}

export interface Visit {
  restaurantId: string;
  visited: boolean;
  visitDate?: string;        // YYYY-MM-DD
  personalRating?: number;   // 1–5
  wouldGoBack?: boolean;
  notes?: string;
  updatedAt?: string;
}

export interface CalculatorItem {
  id: string;
  name: string;
  category: string;
  costco_price_per_lb: number;
  hmart_price_per_lb: number;
  updated_at: string;
}
