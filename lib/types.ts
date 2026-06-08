export interface AyceTier {
  label: string;
  price: number;
}

export interface Restaurant {
  id: string;
  name: string;
  neighborhood: string;
  ayce: boolean;
  ayce_tiers: AyceTier[];
  non_ayce_est_per_person: number | null;
  yelp_rating: number;
  google_rating: number;
  review_count: number;
  last_price_check: string;
  lat: number;
  lng: number;
  yelp_url: string;
  notes: string;
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
