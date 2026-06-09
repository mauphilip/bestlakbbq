"use client";

import { useState, useEffect } from "react";
import {
  Download, RefreshCw, CheckCircle, AlertTriangle, ExternalLink,
  ChevronDown, ChevronUp, Clock, ShieldAlert, ArrowRight,
} from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { DiscoverCandidate, RestaurantDiff } from "@/lib/yelp-types";

interface Props {
  token: string;
  onImported: (restaurants: Restaurant[]) => void;
  onUpdated?: () => void; // signal parent to reload list
}

type SubTab = "discover" | "sync";

const CONFIDENCE_STYLES = {
  high: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-red-500/15 text-red-500 border-red-500/20",
} as const;
const CONFIDENCE_LABELS = { high: "KBBQ ✓", medium: "likely KBBQ", low: "not KBBQ?" } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Diff cell helper
// ─────────────────────────────────────────────────────────────────────────────
function DiffValue({
  cur, next, suffix = "", fmt,
}: {
  cur: string | number | null;
  next: string | number | null;
  suffix?: string;
  fmt?: (v: string | number) => string;
}) {
  const f = (v: string | number | null) =>
    v === null ? "—" : fmt ? fmt(v) : String(v);

  const changed = next !== null && cur !== next;
  if (!changed) return <span className="text-muted-foreground">{f(cur)}{suffix}</span>;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <span className="line-through text-muted-foreground/50 text-xs">{f(cur)}{suffix}</span>
      <ArrowRight className="w-3 h-3 text-primary shrink-0" />
      <span className="font-semibold text-primary">{f(next)}{suffix}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function YelpImportPanel({ token, onImported, onUpdated }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("discover");

  // ── Discover ────────────────────────────────────────────────────────────────
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [discoverError, setDiscoverError] = useState("");
  const [showTracked, setShowTracked] = useState(false);
  const [showLowConf, setShowLowConf] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [confFilter, setConfFilter] = useState<"high" | "medium" | "all">("high");

  // ── Sync / Health check ─────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [diffs, setDiffs] = useState<RestaurantDiff[] | null>(null);
  const [selectedSync, setSelectedSync] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState("");
  const [syncStats, setSyncStats] = useState<{ closedCount: number; changedCount: number; upToDateCount: number; errorCount: number } | null>(null);
  const [syncFilter, setSyncFilter] = useState<"all" | "changed" | "closed">("all");

  // Load cached discover on mount
  useEffect(() => { loadDiscover(false); }, []); // eslint-disable-line

  // ── Derived ─────────────────────────────────────────────────────────────────
  const newCandidates = candidates.filter((c) => !c.already_tracked && !c.is_closed);
  const filteredNew = newCandidates.filter((c) =>
    confFilter === "all" ? true :
    confFilter === "medium" ? c.kbbq_confidence !== "low" :
    c.kbbq_confidence === "high"
  );
  const trackedCandidates = candidates.filter((c) => c.already_tracked);
  const lowConfNew = newCandidates.filter((c) => c.kbbq_confidence === "low");

  const filteredDiffs = diffs?.filter((d) =>
    syncFilter === "all" ? true :
    syncFilter === "closed" ? d.now_closed :
    d.changes.length > 0 // "changed" includes closed too
  ) ?? [];
  const diffsWithChanges = diffs?.filter((d) => d.changes.length > 0) ?? [];

  // ── Discover actions ────────────────────────────────────────────────────────
  async function loadDiscover(force: boolean) {
    setDiscovering(true);
    setDiscoverError("");
    if (force) { setCandidates([]); setSelectedImport(new Set()); setImportedCount(0); }
    try {
      const res = await fetch(`/api/restaurants/yelp-discover${force ? "?refresh=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      const cands: DiscoverCandidate[] = data.candidates ?? [];
      setCandidates(cands);
      setLastFetched(data.lastFetched ?? null);
      setFromCache(!!data.fromCache);
      const autoSelect = new Set<string>(
        cands.filter((c) => !c.already_tracked && !c.is_closed && c.kbbq_confidence === "high").map((c) => c.yelp_id)
      );
      setSelectedImport(autoSelect);
    } catch (e) { setDiscoverError(String(e)); }
    setDiscovering(false);
  }

  async function importSelected() {
    const toImport = filteredNew.filter((c) => selectedImport.has(c.yelp_id));
    if (!toImport.length) return;
    setImporting(true);
    let saved = 0;
    const imported: Restaurant[] = [];
    for (const c of toImport) {
      try {
        const r: Restaurant = {
          id: c.id!, name: c.name!, neighborhood: c.neighborhood!,
          ayce: false, ayce_tiers: [], non_ayce_est_per_person: null,
          price_tier: c.price_tier as import("@/lib/types").PriceTier | undefined, price_verified: false,
          yelp_id: c.yelp_id, yelp_rating: c.yelp_rating ?? 0,
          google_rating: 0, review_count: c.review_count ?? 0,
          lat: c.lat ?? 34.05, lng: c.lng ?? -118.3,
          yelp_url: c.yelp_url ?? "", notes: "",
          last_price_check: new Date().toISOString().slice(0, 10),
          last_yelp_sync: new Date().toISOString(), kv_managed: true,
        };
        const res = await fetch("/api/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(r),
        });
        if (res.ok) { saved++; imported.push(r); }
      } catch { /* skip */ }
    }
    setImportedCount((n) => n + saved);
    setImporting(false);
    if (imported.length) {
      onImported(imported);
      setCandidates((prev) => {
        const ids = new Set(imported.map((r) => r.yelp_id ?? r.id));
        return prev.map((c) => ids.has(c.yelp_id) ? { ...c, already_tracked: true } : c);
      });
    }
  }

  // ── Sync actions ─────────────────────────────────────────────────────────────
  async function runSync() {
    setSyncing(true);
    setSyncError("");
    setDiffs(null);
    setSelectedSync(new Set());
    setAppliedIds(new Set());
    setApplyProgress(null);
    try {
      const res = await fetch("/api/restaurants/yelp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      setDiffs(data.results ?? []);
      setSyncStats({
        closedCount: data.closedCount, changedCount: data.changedCount,
        upToDateCount: data.upToDateCount, errorCount: data.errorCount,
      });
      // Auto-select all changed (non-closed) rows
      const autoSel = new Set<string>(
        (data.results as RestaurantDiff[]).filter((d) => d.changes.length > 0 && !d.now_closed).map((d) => d.id)
      );
      setSelectedSync(autoSel);
    } catch (e) { setSyncError(String(e)); }
    setSyncing(false);
  }

  async function applySelected() {
    const toApply = diffsWithChanges.filter((d) => selectedSync.has(d.id) && !appliedIds.has(d.id));
    if (!toApply.length) return;
    setApplying(true);
    setApplyProgress({ done: 0, total: toApply.length });

    // Fetch all restaurants once
    let allRestaurants: Restaurant[] = [];
    try {
      const res = await fetch("/api/restaurants");
      const data = await res.json();
      allRestaurants = Array.isArray(data) ? data : [];
    } catch { /* ignore */ }

    let done = 0;
    for (const diff of toApply) {
      const current = allRestaurants.find((r) => r.id === diff.id);
      if (!current) { done++; setApplyProgress({ done, total: toApply.length }); continue; }

      const updated = { ...current };
      for (const c of diff.changes) {
        if (c.field === "yelp_rating") updated.yelp_rating = c.new as number;
        if (c.field === "review_count") updated.review_count = c.new as number;
        if (c.field === "price_tier") updated.price_tier = c.new as Restaurant["price_tier"];
        if (c.field === "yelp_url") updated.yelp_url = c.new as string;
      }
      updated.last_yelp_sync = new Date().toISOString();
      if (diff.yelp_id) updated.yelp_id = diff.yelp_id;

      try {
        await fetch("/api/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(updated),
        });
        setAppliedIds((s) => new Set(s).add(diff.id));
      } catch { /* ignore */ }
      done++;
      setApplyProgress({ done, total: toApply.length });
    }

    setApplying(false);
    onUpdated?.();
  }

  const syncAllChangedCount = diffsWithChanges.filter((d) => !appliedIds.has(d.id)).length;
  const selectedNotApplied = [...selectedSync].filter((id) => !appliedIds.has(id)).length;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden text-sm w-fit">
        {([["discover", "Discover New"], ["sync", "Sync & Review"]] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setSubTab(tab as SubTab)}
            className={`px-4 py-2 transition-colors ${subTab === tab ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"}`}>
            {label}
            {tab === "sync" && diffs && diffsWithChanges.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
                {diffsWithChanges.length - appliedIds.size}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ DISCOVER */}
      {subTab === "discover" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">
                Searches Yelp across 8 LA-area locations using two passes (koreanbbq category + Korean term search). Results are cached for 7 days.
              </p>
              {lastFetched && (
                <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fromCache ? "Cached · " : "Fetched · "}{new Date(lastFetched).toLocaleString()}
                </p>
              )}
            </div>
            <button onClick={() => loadDiscover(true)} disabled={discovering}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
              <RefreshCw className={`w-4 h-4 ${discovering ? "animate-spin" : ""}`} />
              {discovering ? "Fetching…" : candidates.length ? "Refresh Yelp" : "Fetch from Yelp"}
            </button>
          </div>

          {discoverError && <ErrorBox msg={discoverError} />}

          {discovering && <LoadingSpinner label="Searching Yelp across 8 locations (2 passes each)… ~30–60s" />}

          {importedCount > 0 && (
            <SuccessBox msg={`${importedCount} restaurants added to your database`} />
          )}

          {candidates.length > 0 && !discovering && (
            <>
              {/* Stats bar */}
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20 font-medium">
                  {newCandidates.length} new
                </span>
                <span className="px-3 py-1.5 bg-secondary rounded-lg border border-border text-muted-foreground">
                  {trackedCandidates.length} already tracked
                </span>
                {lowConfNew.length > 0 && (
                  <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20">
                    {lowConfNew.length} low-confidence hidden
                  </span>
                )}
              </div>

              {/* Confidence filter */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-muted-foreground shrink-0">Show:</span>
                {([["high", "High (KBBQ category)"], ["medium", "High + Medium"], ["all", "All"]] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setConfFilter(v)}
                    className={`px-2.5 py-1 rounded-md border transition-colors ${confFilter === v ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* New candidates */}
              {filteredNew.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{filteredNew.length} new restaurants</p>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setSelectedImport(new Set(filteredNew.map((c) => c.yelp_id)))} className="text-primary hover:underline">All</button>
                      <span className="text-muted-foreground">·</span>
                      <button onClick={() => setSelectedImport(new Set())} className="text-muted-foreground hover:text-foreground">None</button>
                      <span className="text-muted-foreground">· {selectedImport.size} selected</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border divide-y divide-border/50 overflow-hidden">
                    {filteredNew.map((c, i) => {
                      const sel = selectedImport.has(c.yelp_id);
                      return (
                        <div key={c.yelp_id} onClick={() => {
                          setSelectedImport((prev) => { const n = new Set(prev); sel ? n.delete(c.yelp_id) : n.add(c.yelp_id); return n; });
                        }}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${sel ? "bg-primary/5" : i % 2 === 0 ? "bg-card" : "bg-card/50"} hover:bg-primary/8`}>
                          <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${sel ? "bg-primary border-primary" : "border-border"}`}>
                            {sel && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          {c.image_url
                            ? <img src={c.image_url} alt={c.name} className="w-8 h-8 rounded object-cover shrink-0" />
                            : <div className="w-8 h-8 rounded bg-secondary shrink-0" />}
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
                              {c.categories_raw?.length > 0 && <span className="opacity-60"> · {c.categories_raw.slice(0, 3).join(", ")}</span>}
                            </p>
                          </div>
                          {c.yelp_url && (
                            <a href={c.yelp_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary shrink-0">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-4">
                    <p className="text-xs text-muted-foreground">Imported as Non-AYCE with unverified price. Edit in Manage tab to set exact prices.</p>
                    <button onClick={importSelected} disabled={importing || selectedImport.size === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
                      <Download className="w-4 h-4" />
                      {importing ? "Importing…" : `Import ${selectedImport.size}`}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No new restaurants at this confidence level. Try expanding the filter above.
                </p>
              )}

              {/* Low confidence collapsible */}
              {lowConfNew.length > 0 && confFilter !== "all" && (
                <Collapsible
                  label={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />{lowConfNew.length} low-confidence (probably not KBBQ)</span>}
                  defaultOpen={false}>
                  {lowConfNew.map((c) => (
                    <div key={c.yelp_id} className="flex items-center gap-3 px-3 py-2 bg-card/50">
                      <span className="text-sm flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.categories_raw?.slice(0, 2).join(", ")}</span>
                      {c.yelp_url && <a href={c.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary"><ExternalLink className="w-3 h-3" /></a>}
                    </div>
                  ))}
                </Collapsible>
              )}

              {/* Already tracked */}
              {trackedCandidates.length > 0 && (
                <Collapsible label={`Already in your database (${trackedCandidates.length})`} defaultOpen={false}>
                  {trackedCandidates.map((c) => (
                    <div key={c.yelp_id} className="flex items-center gap-3 px-3 py-2 bg-card/50">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-sm flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.neighborhood}</span>
                    </div>
                  ))}
                </Collapsible>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ SYNC */}
      {subTab === "sync" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">
                Fetches current Yelp data for every tracked restaurant. Review the diffs, select which updates to apply, then apply in bulk.
              </p>
              {diffs && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Last checked: {new Date().toLocaleString()}
                </p>
              )}
            </div>
            <button onClick={runSync} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Checking Yelp…" : diffs ? "Re-check All" : "Check All Restaurants"}
            </button>
          </div>

          {syncError && <ErrorBox msg={syncError} />}
          {syncing && <LoadingSpinner label="Fetching each restaurant from Yelp (~1/sec to stay within rate limits)… takes 1–3 min" />}

          {diffs && !syncing && (
            <>
              {/* Stats */}
              <div className="flex flex-wrap gap-2 text-sm">
                {syncStats?.closedCount ? (
                  <span className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 font-medium">
                    {syncStats.closedCount} permanently closed
                  </span>
                ) : null}
                {syncStats?.changedCount ? (
                  <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20 font-medium">
                    {syncStats.changedCount} have updates
                  </span>
                ) : null}
                {syncStats?.upToDateCount ? (
                  <span className="px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg border border-green-500/20">
                    {syncStats.upToDateCount} up to date
                  </span>
                ) : null}
                {syncStats?.errorCount ? (
                  <span className="px-3 py-1.5 bg-secondary text-muted-foreground rounded-lg border border-border">
                    {syncStats.errorCount} no Yelp ID
                  </span>
                ) : null}
              </div>

              {/* Filter + bulk controls */}
              {diffs && diffs.length > 0 && (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex gap-2 text-xs">
                    {([["changed", "Changes only"], ["closed", "Closed only"], ["all", "All restaurants"]] as const).map(([v, label]) => (
                      <button key={v} onClick={() => setSyncFilter(v)}
                        className={`px-2.5 py-1 rounded-md border transition-colors ${syncFilter === v ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button onClick={() => setSelectedSync(new Set(diffsWithChanges.filter((d) => !d.now_closed && !appliedIds.has(d.id)).map((d) => d.id)))}
                      className="text-primary hover:underline">Select all changes</button>
                    <span className="text-muted-foreground">·</span>
                    <button onClick={() => setSelectedSync(new Set())} className="text-muted-foreground hover:text-foreground">None</button>
                    <span className="text-muted-foreground">· {selectedNotApplied} selected</span>
                  </div>
                </div>
              )}

              {/* Diff table */}
              {filteredDiffs.length > 0 ? (
                <>
                  {/* Header */}
                  <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-x-4 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                    <span />
                    <span>Restaurant</span>
                    <span className="text-right">Rating</span>
                    <span className="text-right">Reviews</span>
                    <span className="text-right">Tier</span>
                    <span>Yelp Categories</span>
                    <span />
                  </div>

                  <div className="space-y-1.5">
                    {filteredDiffs.map((diff) => {
                      const hasChanges = diff.changes.length > 0;
                      const isApplied = appliedIds.has(diff.id);
                      const isSel = selectedSync.has(diff.id);
                      const ratingChange = diff.changes.find((c) => c.field === "yelp_rating");
                      const reviewChange = diff.changes.find((c) => c.field === "review_count");
                      const tierChange = diff.changes.find((c) => c.field === "price_tier");

                      return (
                        <div key={diff.id}
                          className={`rounded-xl border px-3 py-3 transition-colors ${
                            diff.now_closed ? "border-red-500/30 bg-red-500/5" :
                            isApplied ? "border-green-500/20 bg-green-500/5 opacity-70" :
                            hasChanges && isSel ? "border-primary/30 bg-primary/5" :
                            hasChanges ? "border-yellow-500/20 bg-yellow-500/5" :
                            "border-border bg-card/50"
                          }`}>
                          {/* Mobile layout */}
                          <div className="flex items-start gap-3 md:hidden">
                            {hasChanges && !diff.now_closed && !isApplied ? (
                              <div onClick={() => setSelectedSync((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                                className={`mt-0.5 w-4 h-4 rounded border shrink-0 cursor-pointer flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                                {isSel && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                              </div>
                            ) : <div className="w-4 h-4 shrink-0" />}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {diff.now_closed && <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                <span className={`text-sm font-medium ${diff.now_closed ? "text-red-400 line-through" : ""}`}>{diff.name}</span>
                                {diff.now_closed && <span className="text-xs text-red-500 font-medium">CLOSED</span>}
                                {isApplied && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Applied</span>}
                                {diff.yelp_url && <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary"><ExternalLink className="w-3 h-3" /></a>}
                              </div>
                              <p className="text-xs text-muted-foreground">{diff.neighborhood}</p>
                              {hasChanges && !diff.now_closed && (
                                <div className="flex flex-wrap gap-3 text-xs pt-1">
                                  {ratingChange && <span>Rating: <DiffValue cur={ratingChange.old as number} next={ratingChange.new as number} /></span>}
                                  {reviewChange && <span>Reviews: <DiffValue cur={reviewChange.old as number} next={reviewChange.new as number} fmt={(v) => Number(v).toLocaleString()} /></span>}
                                  {tierChange && <span>Tier: <DiffValue cur={tierChange.old as string} next={tierChange.new as string} /></span>}
                                </div>
                              )}
                              {diff.error && <p className="text-xs text-muted-foreground/60">{diff.error}</p>}
                            </div>
                          </div>

                          {/* Desktop layout */}
                          <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-x-4 items-center">
                            {hasChanges && !diff.now_closed && !isApplied ? (
                              <div onClick={() => setSelectedSync((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                                className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                                {isSel && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                              </div>
                            ) : <div className="w-4 h-4" />}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {diff.now_closed && <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                <span className={`text-sm font-medium truncate ${diff.now_closed ? "line-through text-red-400" : ""}`}>{diff.name}</span>
                                {diff.now_closed && <span className="text-xs text-red-500 font-medium shrink-0">CLOSED</span>}
                                {isApplied && <span className="text-xs text-green-500 flex items-center gap-1 shrink-0"><CheckCircle className="w-3 h-3" />Applied</span>}
                              </div>
                              <p className="text-xs text-muted-foreground">{diff.neighborhood}{diff.error && ` · ${diff.error}`}</p>
                            </div>

                            <div className="text-sm text-right">
                              {diff.yelp ? (
                                <DiffValue
                                  cur={diff.current.rating}
                                  next={ratingChange ? (ratingChange.new as number) : diff.current.rating}
                                />
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </div>

                            <div className="text-sm text-right">
                              {diff.yelp ? (
                                <DiffValue
                                  cur={diff.current.review_count}
                                  next={reviewChange ? (reviewChange.new as number) : diff.current.review_count}
                                  fmt={(v) => Number(v).toLocaleString()}
                                />
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </div>

                            <div className="text-sm text-right">
                              {diff.yelp ? (
                                <DiffValue
                                  cur={diff.current.price_tier}
                                  next={tierChange ? (tierChange.new as string) : diff.current.price_tier}
                                />
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </div>

                            {/* Yelp categories */}
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                              {diff.yelp?.categories?.map((cat) => (
                                <span key={cat} className={`px-1.5 py-0.5 rounded border ${cat === "koreanbbq" ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 font-medium" : "bg-secondary border-border"}`}>
                                  {cat}
                                </span>
                              )) ?? <span className="text-muted-foreground/40">—</span>}
                            </div>

                            <div className="flex items-center gap-1 justify-end">
                              {diff.yelp_url && (
                                <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bulk apply bar */}
                  {diffsWithChanges.length > 0 && (
                    <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border -mx-0 px-0 py-3 flex items-center justify-between gap-4 flex-wrap">
                      {applyProgress && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1">
                          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-40">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(applyProgress.done / applyProgress.total) * 100}%` }} />
                          </div>
                          {applyProgress.done}/{applyProgress.total} updated
                        </div>
                      )}
                      {!applyProgress && <div className="flex-1" />}
                      <div className="flex gap-2 shrink-0">
                        {syncAllChangedCount > 0 && (
                          <button onClick={() => {
                            setSelectedSync(new Set(diffsWithChanges.filter((d) => !d.now_closed && !appliedIds.has(d.id)).map((d) => d.id)));
                          }} className="text-xs px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground">
                            Select all {syncAllChangedCount}
                          </button>
                        )}
                        <button onClick={applySelected} disabled={applying || selectedNotApplied === 0}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
                          <CheckCircle className="w-4 h-4" />
                          {applying ? `Applying… ${applyProgress?.done ?? 0}/${applyProgress?.total ?? 0}` : `Apply ${selectedNotApplied} update${selectedNotApplied !== 1 ? "s" : ""}`}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {syncFilter === "changed" ? "✓ All restaurants are up to date on Yelp." : "No results for this filter."}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────────────────────────────────────────
function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
      <RefreshCw className="w-5 h-5 animate-spin text-primary" />
      {label}
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{msg}</div>;
}
function SuccessBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
      <CheckCircle className="w-4 h-4" />{msg}
    </div>
  );
}
function Collapsible({ label, children, defaultOpen = false }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <span>{label}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="divide-y divide-border/50 border-t border-border">{children}</div>}
    </div>
  );
}
