"use client";

import { useState, useEffect } from "react";
import {
  Download, RefreshCw, CheckCircle, AlertTriangle, ExternalLink,
  ChevronDown, ChevronUp, ShieldAlert, Clock, Search,
} from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { DiscoverCandidate } from "@/app/api/restaurants/yelp-discover/route";
import type { RestaurantDiff } from "@/app/api/restaurants/yelp-check/route";

interface Props {
  token: string;
  onImported: (restaurants: Restaurant[]) => void;
}

type SubTab = "discover" | "check";

const CONFIDENCE_STYLES = {
  high: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-red-500/15 text-red-500 border-red-500/20",
} as const;

const CONFIDENCE_LABELS = { high: "KBBQ ✓", medium: "likely KBBQ", low: "not KBBQ?" } as const;

export default function YelpImportPanel({ token, onImported }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("discover");

  // ── Discover state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [discoverError, setDiscoverError] = useState("");
  const [showTracked, setShowTracked] = useState(false);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium">("high");

  // ── Health check state ──────────────────────────────────────────────────────
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<RestaurantDiff[] | null>(null);
  const [checkError, setCheckError] = useState("");
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  // Load cached results on mount
  useEffect(() => {
    loadDiscover(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newCandidates = candidates.filter((c) => !c.already_tracked && !c.is_closed);
  const filteredNew = newCandidates.filter((c) =>
    confidenceFilter === "all" ? true : c.kbbq_confidence === confidenceFilter || (confidenceFilter === "medium" && c.kbbq_confidence === "high")
  );
  const trackedCandidates = candidates.filter((c) => c.already_tracked);
  const closedCandidates = candidates.filter((c) => !c.already_tracked && c.is_closed);
  const lowConfidenceNew = newCandidates.filter((c) => c.kbbq_confidence === "low");

  async function loadDiscover(forceRefresh: boolean) {
    setLoading(true);
    setDiscoverError("");
    if (forceRefresh) {
      setCandidates([]);
      setSelected(new Set());
      setSavedCount(0);
    }
    try {
      const url = `/api/restaurants/yelp-discover${forceRefresh ? "?refresh=1" : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const cands: DiscoverCandidate[] = data.candidates ?? [];
      setCandidates(cands);
      setLastFetched(data.lastFetched ?? null);
      setFromCache(!!data.fromCache);
      if (data.errors?.length) console.warn("Yelp partial errors:", data.errors);

      // Auto-select high-confidence new spots
      const autoSelect = new Set<string>(
        cands.filter((c) => !c.already_tracked && !c.is_closed && c.kbbq_confidence === "high").map((c) => c.yelp_id)
      );
      setSelected(autoSelect);
    } catch (e) {
      setDiscoverError(String(e));
    }
    setLoading(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function importSelected() {
    const toImport = filteredNew.filter((c) => selected.has(c.yelp_id));
    if (!toImport.length) return;
    setSaving(true);
    setDiscoverError("");
    let saved = 0;
    const imported: Restaurant[] = [];
    for (const c of toImport) {
      try {
        const restaurant: Restaurant = {
          id: c.id!,
          name: c.name!,
          neighborhood: c.neighborhood!,
          ayce: false,
          ayce_tiers: [],
          non_ayce_est_per_person: null,
          price_tier: c.price_tier,
          price_verified: false,
          yelp_id: c.yelp_id,
          yelp_rating: c.yelp_rating ?? 0,
          google_rating: 0,
          review_count: c.review_count ?? 0,
          lat: c.lat ?? 34.05,
          lng: c.lng ?? -118.3,
          yelp_url: c.yelp_url ?? "",
          notes: "",
          last_price_check: c.last_price_check ?? new Date().toISOString().slice(0, 10),
          last_yelp_sync: c.last_yelp_sync,
          kv_managed: true,
        };
        const res = await fetch("/api/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(restaurant),
        });
        if (res.ok) {
          saved++;
          imported.push(restaurant);
          // Mark as tracked in local state
          setCandidates((prev) =>
            prev.map((c2) => (c2.yelp_id === c.yelp_id ? { ...c2, already_tracked: true } : c2))
          );
        }
      } catch { /* skip */ }
    }
    setSavedCount((n) => n + saved);
    setSaving(false);
    if (imported.length) onImported(imported);
  }

  // ── Health check ────────────────────────────────────────────────────────────
  async function runCheck() {
    setChecking(true);
    setCheckError("");
    setCheckResults(null);
    try {
      const res = await fetch("/api/restaurants/yelp-check", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCheckResults(data.results ?? []);
    } catch (e) {
      setCheckError(String(e));
    }
    setChecking(false);
  }

  async function applyChanges(diff: RestaurantDiff) {
    if (!diff.changes.length) return;
    setApplyingIds((s) => new Set(s).add(diff.id));
    try {
      // Fetch current record first
      const allRes = await fetch("/api/restaurants");
      const allData = await allRes.json();
      const restaurants: Restaurant[] = Array.isArray(allData) ? allData : allData.restaurants ?? [];
      const current = restaurants.find((r) => r.id === diff.id);
      if (!current) return;

      // Apply each change
      const updated = { ...current };
      for (const c of diff.changes) {
        if (c.field === "yelp_rating") updated.yelp_rating = c.new as number;
        if (c.field === "review_count") updated.review_count = c.new as number;
        if (c.field === "price_tier") updated.price_tier = c.new as Restaurant["price_tier"];
        if (c.field === "yelp_url") updated.yelp_url = c.new as string;
      }
      updated.last_yelp_sync = new Date().toISOString();

      await fetch("/api/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updated),
      });
      setAppliedIds((s) => new Set(s).add(diff.id));
    } catch { /* ignore */ }
    setApplyingIds((s) => { const n = new Set(s); n.delete(diff.id); return n; });
  }

  const hasResults = candidates.length > 0;

  return (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden text-sm w-fit">
        {([["discover", "Discover New"], ["check", "Health Check"]] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-4 py-2 transition-colors ${subTab === tab ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── DISCOVER TAB ───────────────────────────────────────────────────── */}
      {subTab === "discover" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">
                Searches Yelp for Korean BBQ across 8 LA-area locations. Results are cached — use Refresh only when you want to re-scan Yelp.
              </p>
              {lastFetched && (
                <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fromCache ? "Loaded from cache · " : "Fetched · "}
                  {new Date(lastFetched).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={() => loadDiscover(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Fetching…" : hasResults ? "Refresh Yelp" : "Fetch from Yelp"}
            </button>
          </div>

          {discoverError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {discoverError}
            </div>
          )}

          {loading && (
            <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              Searching Yelp across 8 locations (2 passes each)… ~30–60s
            </div>
          )}

          {savedCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4" />
              {savedCount} restaurants added to your database
            </div>
          )}

          {hasResults && !loading && (
            <>
              {/* Stats */}
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20 font-medium">
                  {filteredNew.length} new to add
                </span>
                <span className="px-3 py-1.5 bg-secondary rounded-lg border border-border text-muted-foreground">
                  {trackedCandidates.length} already tracked
                </span>
                {closedCandidates.length > 0 && (
                  <span className="px-3 py-1.5 bg-secondary rounded-lg border border-border text-muted-foreground">
                    {closedCandidates.length} closed (hidden)
                  </span>
                )}
                {lowConfidenceNew.length > 0 && (
                  <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20">
                    {lowConfidenceNew.length} low-confidence (hidden)
                  </span>
                )}
              </div>

              {/* Confidence filter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Show:</span>
                {([["high", "High confidence only"], ["medium", "High + Medium"], ["all", "All"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setConfidenceFilter(v)}
                    className={`px-2.5 py-1 rounded-md border transition-colors ${confidenceFilter === v ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"}`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-muted-foreground/60 ml-1">— KBBQ confidence based on Yelp categories + name keywords</span>
              </div>

              {/* New candidates list */}
              {filteredNew.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">New restaurants ({filteredNew.length})</p>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setSelected(new Set(filteredNew.map((c) => c.yelp_id)))} className="text-primary hover:underline">All</button>
                      <span className="text-muted-foreground">·</span>
                      <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground">None</button>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{selected.size} selected</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden">
                    {filteredNew.map((c, i) => {
                      const isSelected = selected.has(c.yelp_id);
                      return (
                        <div
                          key={c.yelp_id}
                          onClick={() => toggleSelect(c.yelp_id)}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-border/50 last:border-0 ${isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-card" : "bg-card/50"} hover:bg-primary/8`}
                        >
                          <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                            {isSelected && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                          </div>

                          {c.image_url ? (
                            <img src={c.image_url} alt={c.name} className="w-8 h-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-secondary shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{c.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${CONFIDENCE_STYLES[c.kbbq_confidence]}`}>
                                {CONFIDENCE_LABELS[c.kbbq_confidence]}
                              </span>
                              {c.price_tier && <span className="text-xs text-muted-foreground">{c.price_tier}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {c.neighborhood} · ★ {c.yelp_rating?.toFixed(1)} · {c.review_count?.toLocaleString()} reviews
                              {c.categories_raw?.length > 0 && (
                                <span className="ml-1 opacity-60">· {c.categories_raw.slice(0, 3).join(", ")}</span>
                              )}
                            </p>
                          </div>

                          {c.yelp_url && (
                            <a href={c.yelp_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:text-primary/80 shrink-0">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-muted-foreground">
                      Imported as Non-AYCE with unverified price. Edit in Manage tab to set exact prices + AYCE status.
                    </p>
                    <button
                      onClick={importSelected}
                      disabled={saving || selected.size === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 ml-4"
                    >
                      <Download className="w-4 h-4" />
                      {saving ? "Importing…" : `Import ${selected.size}`}
                    </button>
                  </div>
                </div>
              )}

              {filteredNew.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No new restaurants found at this confidence level. Try expanding the filter above.
                </div>
              )}

              {/* Low confidence collapsible */}
              {lowConfidenceNew.length > 0 && confidenceFilter !== "all" && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowLowConfidence((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      {lowConfidenceNew.length} low-confidence (probably not KBBQ)
                    </span>
                    {showLowConfidence ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showLowConfidence && (
                    <div className="divide-y divide-border/50 border-t border-border">
                      {lowConfidenceNew.map((c) => (
                        <div key={c.yelp_id} className="flex items-center gap-3 px-3 py-2 bg-card/50">
                          <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{c.categories_raw?.slice(0, 2).join(", ")}</span>
                          {c.yelp_url && (
                            <a href={c.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Already tracked */}
              {trackedCandidates.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowTracked((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Already in your database ({trackedCandidates.length})</span>
                    {showTracked ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showTracked && (
                    <div className="divide-y divide-border/50 border-t border-border">
                      {trackedCandidates.map((c) => (
                        <div key={c.yelp_id} className="flex items-center gap-3 px-3 py-2 bg-card/50">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{c.neighborhood}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── HEALTH CHECK TAB ───────────────────────────────────────────────── */}
      {subTab === "check" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">
                Checks every tracked restaurant against Yelp for closures, rating changes, price tier updates, and URL changes. This calls the Yelp API for each restaurant — takes 1–3 minutes.
              </p>
            </div>
            <button
              onClick={runCheck}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              <Search className={`w-4 h-4 ${checking ? "animate-pulse" : ""}`} />
              {checking ? "Checking…" : "Check All Restaurants"}
            </button>
          </div>

          {checkError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{checkError}</div>
          )}

          {checking && (
            <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              Checking restaurants against Yelp… checking ~1 per second to stay within rate limits
            </div>
          )}

          {checkResults && !checking && (
            <>
              {/* Summary */}
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="px-3 py-1.5 bg-secondary rounded-lg border border-border text-muted-foreground">
                  {checkResults.length} checked
                </span>
                {checkResults.filter((r) => r.now_closed).length > 0 && (
                  <span className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 font-medium">
                    {checkResults.filter((r) => r.now_closed).length} permanently closed
                  </span>
                )}
                {checkResults.filter((r) => r.changes.length > 0 && !r.now_closed).length > 0 && (
                  <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20 font-medium">
                    {checkResults.filter((r) => r.changes.length > 0 && !r.now_closed).length} have updates
                  </span>
                )}
                {checkResults.filter((r) => !r.changes.length && !r.now_closed && !r.error).length > 0 && (
                  <span className="px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg border border-green-500/20">
                    {checkResults.filter((r) => !r.changes.length && !r.now_closed && !r.error).length} up to date
                  </span>
                )}
              </div>

              {/* Closed restaurants */}
              {checkResults.filter((r) => r.now_closed).map((diff) => (
                <DiffRow key={diff.id} diff={diff} token={token} applyingIds={applyingIds} appliedIds={appliedIds} onApply={applyChanges} severity="closed" />
              ))}

              {/* Changed restaurants */}
              {checkResults.filter((r) => r.changes.length > 0 && !r.now_closed).map((diff) => (
                <DiffRow key={diff.id} diff={diff} token={token} applyingIds={applyingIds} appliedIds={appliedIds} onApply={applyChanges} severity="changed" />
              ))}

              {/* Up to date / errors */}
              {checkResults.filter((r) => !r.changes.length && !r.now_closed).length > 0 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  {checkResults.filter((r) => !r.changes.length && !r.now_closed && !r.error).length} restaurants are up to date on Yelp.
                  {checkResults.filter((r) => r.error).length > 0 && ` ${checkResults.filter((r) => r.error).length} could not be checked (no Yelp ID).`}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DiffRow({
  diff, applyingIds, appliedIds, onApply, severity,
}: {
  diff: RestaurantDiff;
  token: string;
  applyingIds: Set<string>;
  appliedIds: Set<string>;
  onApply: (d: RestaurantDiff) => void;
  severity: "closed" | "changed";
}) {
  const isApplying = applyingIds.has(diff.id);
  const isApplied = appliedIds.has(diff.id);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${severity === "closed" ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {severity === "closed" ? (
            <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
          )}
          <span className="font-medium text-sm">{diff.name}</span>
          {diff.yelp_url && (
            <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {!isApplied && diff.changes.length > 0 && severity !== "closed" && (
          <button
            onClick={() => onApply(diff)}
            disabled={isApplying}
            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isApplying ? "Applying…" : "Apply changes"}
          </button>
        )}
        {isApplied && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Applied
          </span>
        )}
      </div>

      <div className="space-y-1">
        {diff.changes.map((c) => (
          <div key={c.field} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-24 shrink-0">{c.label}</span>
            <span className="line-through text-muted-foreground/60">{String(c.old)}</span>
            <span className="text-foreground font-medium">→ {String(c.new)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
