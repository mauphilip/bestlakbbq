"use client";

import { useState, useEffect, useMemo } from "react";
import { Save, SlidersHorizontal, AlertTriangle, Star } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { DEFAULT_SETTINGS, isRisky, type SiteSettings } from "@/lib/settings-shared";

interface Props {
  token: string;
  restaurants: Restaurant[];
}

export default function SettingsPanel({ token, restaurants }: Props) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d && typeof d.min_rating === "number") setSettings(d); })
      .catch(() => { /* defaults */ })
      .finally(() => setLoaded(true));
  }, []);

  const preview = useMemo(() => {
    const risky = restaurants.filter((r) => isRisky(r, settings));
    const saved = restaurants.filter((r) => r.featured &&
      (r.yelp_rating < settings.min_rating || r.review_count < settings.min_review_count));
    return { risky, saved };
  }, [restaurants, settings]);

  function update(patch: Partial<SiteSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSettings({ min_rating: data.min_rating, min_review_count: data.min_review_count });
      setDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  if (!loaded) {
    return <div className="h-32 bg-card border border-border rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Quality thresholds</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Spots below these bars move to the collapsed &quot;Go at your own risk&quot; section on the
        directory and drop off the homepage chart. Nothing is deleted. Mark a spot as a
        <Star className="w-3 h-3 inline mx-1 text-yellow-500 fill-yellow-500" />
        favorite in its edit form to keep it on the main list regardless.
      </p>

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Minimum Yelp rating</label>
            <input type="number" step="0.1" min="0" max="5" value={settings.min_rating}
              onChange={(e) => update({ min_rating: Number(e.target.value) })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <p className="text-xs text-muted-foreground mt-1">Default {DEFAULT_SETTINGS.min_rating.toFixed(1)}. Below this → risk list.</p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Minimum review count</label>
            <input type="number" step="1" min="0" value={settings.min_review_count}
              onChange={(e) => update({ min_review_count: Math.max(0, Math.floor(Number(e.target.value))) })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <p className="text-xs text-muted-foreground mt-1">0 = off. Fewer reviews than this → risk list.</p>
          </div>
        </div>

        {/* Live preview */}
        <div className="bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-sm space-y-1">
          <p>
            <span className="font-medium">{preview.risky.length}</span>
            <span className="text-muted-foreground"> of {restaurants.length} restaurants would be on the risk list.</span>
          </p>
          {preview.saved.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
              {preview.saved.length} below the bar but kept on the main list as favorites:
              {" "}{preview.saved.slice(0, 5).map((r) => r.name).join(", ")}{preview.saved.length > 5 ? "…" : ""}
            </p>
          )}
          {preview.risky.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Show the risk list</summary>
              <ul className="mt-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                {[...preview.risky].sort((a, b) => b.yelp_rating - a.yelp_rating).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0">★ {r.yelp_rating.toFixed(1)} · {r.review_count.toLocaleString()} reviews</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : dirty ? "Save thresholds" : "Saved"}
          </button>
          {savedAt && !dirty && <span className="text-xs text-green-500">✓ Live on the site</span>}
        </div>
      </div>
    </div>
  );
}
