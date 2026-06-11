// Client-safe, PURE — the single source of truth for Yelp Discover seed locations.
// Used by both the discover API route and the admin DiscoverPanel.
// Yelp searches a wide radius around each location string, so adjacent seeds overlap;
// dedupe by yelp_id happens in the discover route (in-scan) and cache merge (cross-scan).

export type SeedRegion = "LA Core" | "Valley" | "South Bay" | "Gateway" | "SGV" | "OC";

export interface SeedLocation {
  /** Exact string sent to Yelp's `location` search param — also the API batch key. */
  key: string;
  label: string;
  region: SeedRegion;
}

export const SEED_LOCATIONS: SeedLocation[] = [
  // LA core
  { key: "Koreatown, Los Angeles, CA", label: "Koreatown", region: "LA Core" },
  { key: "Los Angeles, CA", label: "LA (other)", region: "LA Core" },
  { key: "Downtown, Los Angeles, CA", label: "DTLA", region: "LA Core" },
  { key: "Hollywood, Los Angeles, CA", label: "Hollywood", region: "LA Core" },
  { key: "Mid-Wilshire, Los Angeles, CA", label: "Mid-Wilshire", region: "LA Core" },
  // Valley
  { key: "Glendale, CA", label: "Glendale", region: "Valley" },
  { key: "Burbank, CA", label: "Burbank", region: "Valley" },
  { key: "Van Nuys, CA", label: "Van Nuys", region: "Valley" },
  { key: "Northridge, CA", label: "Northridge", region: "Valley" },
  // South Bay
  { key: "Gardena, CA", label: "Gardena", region: "South Bay" },
  { key: "Torrance, CA", label: "Torrance", region: "South Bay" },
  { key: "Long Beach, CA", label: "Long Beach", region: "South Bay" },
  // Gateway cities
  { key: "Cerritos, CA", label: "Cerritos", region: "Gateway" },
  { key: "Downey, CA", label: "Downey", region: "Gateway" },
  // San Gabriel Valley
  { key: "Alhambra, CA", label: "Alhambra", region: "SGV" },
  { key: "Monterey Park, CA", label: "Monterey Park", region: "SGV" },
  { key: "San Gabriel, CA", label: "San Gabriel", region: "SGV" },
  { key: "Rowland Heights, CA", label: "Rowland Heights", region: "SGV" },
  { key: "Hacienda Heights, CA", label: "Hacienda Heights", region: "SGV" },
  { key: "West Covina, CA", label: "West Covina", region: "SGV" },
  { key: "Diamond Bar, CA", label: "Diamond Bar", region: "SGV" },
  // Orange County
  { key: "Buena Park, CA", label: "Buena Park", region: "OC" },
  { key: "Fullerton, CA", label: "Fullerton", region: "OC" },
  { key: "Anaheim, CA", label: "Anaheim", region: "OC" },
  { key: "Garden Grove, CA", label: "Garden Grove", region: "OC" },
  { key: "Irvine, CA", label: "Irvine", region: "OC" },
  { key: "Santa Ana, CA", label: "Santa Ana / Tustin", region: "OC" },
];

export const SEED_REGIONS: SeedRegion[] = ["LA Core", "Valley", "South Bay", "Gateway", "SGV", "OC"];

export function locationsForRegion(region: SeedRegion): SeedLocation[] {
  return SEED_LOCATIONS.filter((l) => l.region === region);
}
