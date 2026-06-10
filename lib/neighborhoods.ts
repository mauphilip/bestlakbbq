import { redis } from "@/lib/kv";

export const ZIP_MAP_KEY = "kbbq_zip_map";

/** Seed map (the previous hardcoded ZIP_TO_NEIGHBORHOOD). Used until a map is saved to KV. */
export const DEFAULT_ZIP_MAP: Record<string, string> = {
  "90004": "Koreatown", "90005": "Koreatown", "90006": "Koreatown",
  "90010": "Koreatown", "90019": "Koreatown", "90020": "Koreatown",
  "90036": "Mid-Wilshire",
  "90247": "Gardena", "90248": "Gardena", "90249": "Gardena",
  "90501": "Torrance", "90502": "Torrance", "90503": "Torrance",
  "90504": "Torrance", "90505": "Torrance", "90506": "Torrance",
  "91401": "Van Nuys", "91402": "Van Nuys", "91405": "Van Nuys",
  "91406": "Van Nuys", "91411": "Van Nuys", "91423": "Van Nuys",
  "91201": "Glendale", "91202": "Glendale", "91203": "Glendale",
  "91204": "Glendale", "91205": "Glendale", "91206": "Glendale",
  "91748": "Rowland Heights", "91789": "Rowland Heights",
  "91801": "Alhambra", "91803": "Alhambra",
  "91754": "SGV", "91755": "SGV", "91770": "SGV",
  "92612": "Irvine", "92614": "Irvine", "92617": "Irvine",
  "92618": "Irvine", "92620": "Irvine", "92604": "Irvine",
  "90620": "Buena Park", "90621": "Buena Park",
  "92801": "Anaheim", "92802": "Anaheim", "92804": "Anaheim",
  "90701": "Cerritos", "90703": "Cerritos",
  "92833": "Fullerton", "92835": "Fullerton",
  "92868": "Orange County", "92865": "Orange County",
};

/** Full zip→neighborhood map: the saved KV map if present, else the seed. Non-fatal. */
export async function getZipMap(): Promise<Record<string, string>> {
  try {
    const m = await redis.get<Record<string, string>>(ZIP_MAP_KEY);
    if (m && Object.keys(m).length) return m;
  } catch { /* ignore */ }
  return DEFAULT_ZIP_MAP;
}
