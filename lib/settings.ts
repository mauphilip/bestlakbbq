// SERVER-ONLY settings access (reads KV). Pure helpers live in lib/settings-shared.ts.

import { redis } from "@/lib/kv";
import { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/settings-shared";

export { DEFAULT_SETTINGS, isRisky, type SiteSettings } from "@/lib/settings-shared";

export const SETTINGS_KEY = "kbbq_settings";

/** Saved settings from KV, falling back to defaults field-by-field. Non-fatal. */
export async function getSettings(): Promise<SiteSettings> {
  try {
    const saved = await redis.get<Partial<SiteSettings>>(SETTINGS_KEY);
    if (saved) {
      return {
        min_rating: typeof saved.min_rating === "number" ? saved.min_rating : DEFAULT_SETTINGS.min_rating,
        min_review_count: typeof saved.min_review_count === "number" ? saved.min_review_count : DEFAULT_SETTINGS.min_review_count,
      };
    }
  } catch { /* KV unavailable */ }
  return DEFAULT_SETTINGS;
}
