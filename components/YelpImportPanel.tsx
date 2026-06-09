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

interface LinkResult {
  id: string;
  name: string;
  neighborhood: string;
  yelp_url: string;
  candidates: {
    yelp_id: string; name: string; url: string; rating: number;
    review_count: number; address: string; categories: string[];
  }[];
}

const ALL_DISCOVER_LOCATIONS = [
  { key: "Koreatown, Los Angeles, CA", label: "Koreatown" },
  { key: "Los Angeles, CA", label: "LA (other)" },
  { key: "Gardena, CA", label: "Gardena" },
  { key: "Torrance, CA", label: "Torrance" },
  { key: "Rowland Heights, CA", label: "Rowland Heights" },
  { key: "Irvine, CA", label: "Irvine" },
  { key: "Cerritos, CA", label: "Cerritos" },
  { key: "Buena Park, CA", label: "Buena Park" },
];

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
  const [selectedLocations, setSelectedLocations] = useState<string[]>(ALL_DISCOVER_LOCATIONS.map((l) => l.key));
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [discoverError, setDiscoverError] = useState("");
  const [discoverWarnings, setDiscoverWarnings] = useState<string[]>([]);
  const [showTracked, setShowTracked] = useState(false);
  const [showLowConf, setShowLowConf] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [confFilter, setConfFilter] = useState<"high" | "medium" | "all">("high");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("All");

  // ── Closure check ────────────────────────────────────────────────────────────
  const [closureRunning, setClosureRunning] = useState(false);
  const [closureResults, setClosureResults] = useState<RestaurantDiff[] | null>(null);
  const [closureError, setClosureError] = useState("");
  const [closureSelected, setClosureSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [closureLastChecked, setClosureLastChecked] = useState<string | null>(null);

  // ── Data sync ────────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [diffs, setDiffs] = useState<RestaurantDiff[] | null>(null);
  const [selectedSync, setSelectedSync] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState("");
  const [syncStats, setSyncStats] = useState<{ changedCount: number; upToDateCount: number; errorCount: number } | null>(null);
  const [syncLastChecked, setSyncLastChecked] = useState<string | null>(null);

  // ── Yelp link ────────────────────────────────────────────────────────────────
  const [linkScanning, setLinkScanning] = useState(false);
  const [linkResults, setLinkResults] = useState<LinkResult[] | null>(null);
  const [linkError, setLinkError] = useState("");
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [savedLinks, setSavedLinks] = useState<Set<string>>(new Set());

  // All restaurants (for KV-managed check)
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  useEffect(() => {
    fetch("/api/restaurants").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setAllRestaurants(d);
    }).catch(() => {});
  }, []);

  // Load cached discover on mount + restore cached sync results
  useEffect(() => {
    loadDiscover(false);
    // Restore closure cache
    try {
      const raw = sessionStorage.getItem("kbbq_closure_cache");
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.results) {
          setClosureResults(cached.results);
          setClosureLastChecked(cached.timestamp ?? null);
        }
      }
    } catch { /* ignore */ }
    // Restore sync cache
    try {
      const raw = sessionStorage.getItem("kbbq_sync_cache");
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.results) {
          setDiffs(cached.results);
          setSyncStats(cached.stats ?? null);
          setSyncLastChecked(cached.timestamp ?? null);
          const autoSel = new Set<string>(
            (cached.results as RestaurantDiff[]).filter((d: RestaurantDiff) => d.changes.length > 0).map((d: RestaurantDiff) => d.id)
          );
          setSelectedSync(autoSel);
        }
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line

  // ── Derived ─────────────────────────────────────────────────────────────────
  const newCandidates = candidates.filter((c) => !c.already_tracked && !c.is_closed);
  const confFiltered = newCandidates.filter((c) =>
    confFilter === "all" ? true :
    confFilter === "medium" ? c.kbbq_confidence !== "low" :
    c.kbbq_confidence === "high"
  );
  const lowRatedNew = confFiltered.filter((c) => (c.yelp_rating ?? 0) < 3);
  const qualifiedNew = confFiltered.filter((c) => (c.yelp_rating ?? 0) >= 3);
  // Unique neighborhoods from qualified (≥3★) results, sorted
  const availableNeighborhoods = ["All", ...Array.from(new Set(qualifiedNew.map((c) => c.neighborhood ?? "Unknown"))).sort()];
  const filteredNew = qualifiedNew.filter((c) =>
    neighborhoodFilter === "All" ? true : c.neighborhood === neighborhoodFilter
  );
  const trackedCandidates = candidates.filter((c) => c.already_tracked);
  const lowConfNew = newCandidates.filter((c) => c.kbbq_confidence === "low");

  const diffsWithChanges = diffs?.filter((d) => d.changes.length > 0) ?? [];

  // ── Discover actions ────────────────────────────────────────────────────────
  async function loadDiscover(force: boolean, locations?: string[]) {
    setDiscovering(true);
    setDiscoverError("");
    setDiscoverWarnings([]);
    if (force) { setCandidates([]); setSelectedImport(new Set()); setImportedCount(0); }
    try {
      let url = `/api/restaurants/yelp-discover${force ? "?refresh=1" : ""}`;
      if (force && locations && locations.length < ALL_DISCOVER_LOCATIONS.length) {
        url += `&locations=${encodeURIComponent(locations.join(","))}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);

      const cands: DiscoverCandidate[] = data.candidates ?? [];
      const warnings: string[] = data.errors ?? [];

      // If Yelp returned errors for every location and no results came back, treat as failure
      if (force && cands.length === 0 && warnings.length > 0) {
        throw new Error(`Yelp API returned errors for all locations:\n${warnings.slice(0, 3).join("\n")}${warnings.length > 3 ? `\n…and ${warnings.length - 3} more` : ""}`);
      }

      setCandidates(cands);
      setLastFetched(data.lastFetched ?? null);
      setFromCache(!!data.fromCache);
      if (warnings.length) setDiscoverWarnings(warnings);

      const autoSelect = new Set<string>(
        cands.filter((c) => !c.already_tracked && !c.is_closed && c.kbbq_confidence === "high").map((c) => c.yelp_id)
      );
      setSelectedImport(autoSelect);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDiscoverError(msg);
    }
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

  // ── Closure check action ──────────────────────────────────────────────────────
  async function runClosureCheck() {
    setClosureRunning(true);
    setClosureError("");
    setClosureResults(null);
    setClosureSelected(new Set());
    setDeletedIds(new Set());
    try {
      const res = await fetch("/api/restaurants/yelp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "closed" }),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      const results: RestaurantDiff[] = data.results ?? [];
      const timestamp = new Date().toISOString();
      setClosureResults(results);
      setClosureLastChecked(timestamp);
      // Save to sessionStorage so results survive page reload
      try { sessionStorage.setItem("kbbq_closure_cache", JSON.stringify({ results, timestamp })); } catch { /* ignore */ }
      // Pre-select all KV-managed (deletable) closed restaurants
      const allRes = await fetch("/api/restaurants").then((r) => r.json()).catch(() => []);
      const kvIds = new Set<string>((allRes as Restaurant[]).filter((r) => r.kv_managed).map((r) => r.id));
      setClosureSelected(new Set(results.filter((r) => kvIds.has(r.id)).map((r) => r.id)));
    } catch (e) { setClosureError(String(e)); }
    setClosureRunning(false);
  }

  async function deleteClosureSelected(allRestaurants: Restaurant[]) {
    const toDelete = [...closureSelected].filter((id) => !deletedIds.has(id));
    if (!toDelete.length) return;
    setDeleting(true);
    for (const id of toDelete) {
      const r = allRestaurants.find((x) => x.id === id);
      if (!r?.kv_managed) continue; // base JSON — can't delete from UI
      try {
        await fetch(`/api/restaurants/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setDeletedIds((s) => new Set(s).add(id));
      } catch { /* ignore */ }
    }
    setDeleting(false);
    onUpdated?.();
  }

  // ── Data sync action ──────────────────────────────────────────────────────────
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
        body: JSON.stringify({ mode: "updates" }),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      const results: RestaurantDiff[] = data.results ?? [];
      const stats = { changedCount: data.changedCount, upToDateCount: data.upToDateCount, errorCount: data.errorCount };
      const timestamp = new Date().toISOString();
      setDiffs(results);
      setSyncStats(stats);
      setSyncLastChecked(timestamp);
      // Save to sessionStorage so results survive page reload
      try { sessionStorage.setItem("kbbq_sync_cache", JSON.stringify({ results, stats, timestamp })); } catch { /* ignore */ }
      const autoSel = new Set<string>(results.filter((d) => d.changes.length > 0).map((d) => d.id));
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

  // ── Yelp link actions ─────────────────────────────────────────────────────
  async function runLinkScan() {
    setLinkScanning(true);
    setLinkError("");
    setLinkResults(null);
    try {
      const res = await fetch("/api/restaurants/yelp-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "scan" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLinkResults(data.results ?? []);
    } catch (e) { setLinkError(String(e)); }
    setLinkScanning(false);
  }

  async function saveLink(restaurantId: string, yelp_id: string, yelp_url: string) {
    setSavingLink(restaurantId);
    try {
      const res = await fetch("/api/restaurants/yelp-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: restaurantId, yelp_id, yelp_url }),
      });
      if (res.ok) {
        setSavedLinks((s) => new Set(s).add(restaurantId));
        onUpdated?.();
      }
    } catch { /* ignore */ }
    setSavingLink(null);
  }

  const syncAllChangedCount = diffsWithChanges.filter((d) => !appliedIds.has(d.id)).length;
  const selectedNotApplied = [...selectedSync].filter((id) => !appliedIds.has(id)).length;
  const pendingSyncBadge = diffsWithChanges.length - appliedIds.size;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden text-sm w-fit">
        {([["discover", "Discover New"], ["sync", "Sync & Review"]] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setSubTab(tab as SubTab)}
            className={`px-4 py-2 transition-colors ${subTab === tab ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"}`}>
            {label}
            {tab === "sync" && pendingSyncBadge > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
                {pendingSyncBadge}
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
                Searches Yelp across 8 LA-area locations for the <code className="text-xs bg-secondary px-1 rounded">koreanbbq</code> category. Shows restaurants Yelp returned that aren&apos;t already in your database. Results are cached for 7 days.
              </p>
              {lastFetched && (
                <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fromCache ? "Cached · " : "Fetched · "}{new Date(lastFetched).toLocaleString()}
                </p>
              )}
            </div>
            <button onClick={() => loadDiscover(true, selectedLocations)} disabled={discovering}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
              <RefreshCw className={`w-4 h-4 ${discovering ? "animate-spin" : ""}`} />
              {discovering ? "Fetching…" : candidates.length ? "Refresh Yelp" : "Fetch from Yelp"}
            </button>
          </div>

          {/* Location chips */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">Locations:</span>
              {ALL_DISCOVER_LOCATIONS.map((loc) => {
                const active = selectedLocations.includes(loc.key);
                return (
                  <button key={loc.key} onClick={() => setSelectedLocations((prev) =>
                    active ? prev.filter((l) => l !== loc.key) : [...prev, loc.key]
                  )}
                    className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${active ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"}`}>
                    {loc.label}
                  </button>
                );
              })}
              <button onClick={() => setSelectedLocations(ALL_DISCOVER_LOCATIONS.map((l) => l.key))}
                className="text-xs text-primary hover:underline ml-1">All</button>
              <span className="text-xs text-muted-foreground">·</span>
              <button onClick={() => setSelectedLocations([])}
                className="text-xs text-muted-foreground hover:text-foreground">None</button>
            </div>
            {selectedLocations.length < ALL_DISCOVER_LOCATIONS.length && fromCache && (
              <p className="text-xs text-muted-foreground/70 italic">Filtering to selected areas — cached results show all areas.</p>
            )}
          </div>

          {discoverError && <ErrorBox msg={discoverError} />}

          {discoverWarnings.length > 0 && !discoverError && (
            <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 space-y-0.5">
              <p className="font-medium">⚠ Some Yelp searches had partial errors — results may be incomplete:</p>
              {discoverWarnings.slice(0, 5).map((w, i) => <p key={i} className="opacity-80">{w}</p>)}
              {discoverWarnings.length > 5 && <p className="opacity-60">…and {discoverWarnings.length - 5} more</p>}
            </div>
          )}

          {discovering && <LoadingSpinner label="Searching Yelp across 8 locations… ~20–40s" />}

          {importedCount > 0 && (
            <SuccessBox msg={`${importedCount} restaurants added to your database`} />
          )}

          {!discovering && lastFetched && !fromCache && candidates.length === 0 && !discoverError && (
            <div className="text-sm text-center py-6 text-muted-foreground border border-border rounded-xl">
              Yelp returned 0 results. Check that <code className="text-xs bg-secondary px-1 py-0.5 rounded">YELP_API_KEY</code> is set in Vercel environment variables.
            </div>
          )}

          {candidates.length > 0 && !discovering && (
            <>
              {/* Stats bar */}
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20 font-medium">
                  {newCandidates.length} not in your DB
                </span>
                <span className="px-3 py-1.5 bg-secondary rounded-lg border border-border text-muted-foreground">
                  {trackedCandidates.length} of these results already tracked
                </span>
                {lowConfNew.length > 0 && (
                  <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20">
                    {lowConfNew.length} probably-not-KBBQ hidden
                  </span>
                )}
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                {/* Confidence filter */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0">Yelp tag:</span>
                  {([["high", "Official KBBQ tag"], ["medium", "Include likely"], ["all", "All results"]] as const).map(([v, label]) => (
                    <button key={v} onClick={() => { setConfFilter(v); setNeighborhoodFilter("All"); }}
                      className={`px-2.5 py-1 rounded-md border transition-colors ${confFilter === v ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Neighborhood filter */}
                {availableNeighborhoods.length > 2 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground shrink-0">Neighborhood:</span>
                    {availableNeighborhoods.map((n) => (
                      <button key={n} onClick={() => setNeighborhoodFilter(n)}
                        className={`px-2.5 py-1 rounded-md border transition-colors ${neighborhoodFilter === n ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* New candidates */}
              {filteredNew.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {filteredNew.length} restaurant{filteredNew.length !== 1 ? "s" : ""}
                      {neighborhoodFilter !== "All" ? ` in ${neighborhoodFilter}` : " not in your database"}
                    </p>
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

              {/* Low-rated collapsible */}
              {lowRatedNew.length > 0 && (
                <Collapsible
                  label={`${lowRatedNew.length} under 3★ (excluded from import)`}
                  defaultOpen={false}>
                  {lowRatedNew.map((c) => (
                    <div key={c.yelp_id} className="flex items-center gap-3 px-3 py-2 bg-card/50">
                      {c.image_url
                        ? <img src={c.image_url} alt={c.name} className="w-7 h-7 rounded object-cover shrink-0" />
                        : <div className="w-7 h-7 rounded bg-secondary shrink-0" />}
                      <span className="text-sm flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium shrink-0">★ {c.yelp_rating?.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{c.neighborhood}</span>
                      {c.yelp_url && <a href={c.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0"><ExternalLink className="w-3 h-3" /></a>}
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
        <div className="space-y-6">

          {/* ── Section 1: Closure check ─────────────────────────────────── */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Check for Closed Restaurants</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Checks every tracked restaurant against Yelp and lists any that are permanently closed.
                </p>
                {closureLastChecked && (
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    Last checked {new Date(closureLastChecked).toLocaleString()}
                  </p>
                )}
              </div>
              <button onClick={runClosureCheck} disabled={closureRunning}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-medium rounded-lg hover:bg-red-500/20 disabled:opacity-50 shrink-0 transition-colors">
                <RefreshCw className={`w-4 h-4 ${closureRunning ? "animate-spin" : ""}`} />
                {closureRunning ? "Checking…" : closureResults ? "Re-check" : "Check Closures"}
              </button>
            </div>

            {closureError && <ErrorBox msg={closureError} />}
            {closureRunning && <LoadingSpinner label="Checking each restaurant on Yelp… takes 1–2 min" />}

            {closureResults && !closureRunning && (
              closureResults.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="w-4 h-4" /> All {`restaurants are still open on Yelp.`}
                </div>
              ) : (() => {
                  const kvIds = new Set(allRestaurants.filter((r) => r.kv_managed).map((r) => r.id));
                  const visible = closureResults.filter((d) => !deletedIds.has(d.id));
                  const selectableIds = visible.filter((d) => kvIds.has(d.id)).map((d) => d.id);
                  const baseJsonClosed = visible.filter((d) => !kvIds.has(d.id));
                  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => closureSelected.has(id));

                  return (
                    <div className="space-y-3">
                      {/* Header + select all */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs font-medium text-red-500">{visible.length} permanently closed</p>
                        {selectableIds.length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <button onClick={() => setClosureSelected(allSelected ? new Set() : new Set(selectableIds))}
                              className="text-primary hover:underline">{allSelected ? "Deselect all" : `Select all ${selectableIds.length}`}</button>
                            <span className="text-muted-foreground">· {closureSelected.size} selected</span>
                          </div>
                        )}
                      </div>

                      {/* Closed restaurant rows */}
                      <div className="space-y-1.5">
                        {visible.map((diff) => {
                          const displayName = diff.name || diff.yelp_id || diff.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] || "Unknown restaurant";
                          const isKv = kvIds.has(diff.id);
                          const isSel = closureSelected.has(diff.id);

                          return (
                            <div key={diff.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                              isKv ? "border-red-500/20 bg-red-500/5" : "border-border bg-card/50 opacity-70"
                            }`}>
                              {isKv ? (
                                <div onClick={() => setClosureSelected((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                                  className={`w-4 h-4 rounded border shrink-0 cursor-pointer flex items-center justify-center ${isSel ? "bg-red-500 border-red-500" : "border-border"}`}>
                                  {isSel && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0" />
                              )}

                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium line-through text-red-400">{displayName}</span>
                                {diff.neighborhood && <span className="text-xs text-muted-foreground ml-2">{diff.neighborhood}</span>}
                                {!isKv && <span className="text-xs text-muted-foreground ml-2 italic">(base JSON — remove manually)</span>}
                              </div>

                              {diff.yelp_url && (
                                <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                                  Yelp <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Base JSON note */}
                      {baseJsonClosed.length > 0 && (
                        <p className="text-xs text-muted-foreground/70 italic">
                          {baseJsonClosed.length} restaurant{baseJsonClosed.length !== 1 ? "s are" : " is"} in base JSON and must be removed from <code className="text-xs bg-secondary px-1 rounded">data/restaurants.json</code> manually.
                        </p>
                      )}

                      {/* Bulk delete bar */}
                      {closureSelected.size > 0 && (
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                          <p className="text-xs text-muted-foreground">{closureSelected.size} selected for deletion</p>
                          <button onClick={() => deleteClosureSelected(allRestaurants)} disabled={deleting}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                            <ShieldAlert className="w-4 h-4" />
                            {deleting ? "Deleting…" : `Delete ${closureSelected.size} restaurant${closureSelected.size !== 1 ? "s" : ""}`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
            )}
          </div>

          {/* ── Section 2: Data sync ──────────────────────────────────────── */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Sync Live Data from Yelp</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updates review counts, price tiers, and Yelp URLs.{" "}
                  <span className="italic">Note: API ratings may differ slightly from website display.</span>
                </p>
                {syncLastChecked && (
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    Last synced {new Date(syncLastChecked).toLocaleString()}
                  </p>
                )}
              </div>
              <button onClick={runSync} disabled={syncing}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0 transition-colors">
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : diffs ? "Re-sync" : "Sync Data"}
              </button>
            </div>

            {syncError && <ErrorBox msg={syncError} />}
            {syncing && <LoadingSpinner label="Fetching each restaurant from Yelp (~1/sec)… takes 1–3 min" />}

            {diffs && !syncing && (
              <>
                {/* Stats */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {syncStats?.changedCount ? (
                    <span className="px-2.5 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20 font-medium">
                      {syncStats.changedCount} have updates
                    </span>
                  ) : null}
                  {syncStats?.upToDateCount ? (
                    <span className="px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg border border-green-500/20">
                      {syncStats.upToDateCount} up to date
                    </span>
                  ) : null}
                  {syncStats?.errorCount ? (
                    <span className="px-2.5 py-1 bg-secondary text-muted-foreground rounded-lg border border-border">
                      {syncStats.errorCount} no Yelp ID
                    </span>
                  ) : null}
                </div>

                {/* Select controls */}
                {diffsWithChanges.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button onClick={() => setSelectedSync(new Set(diffsWithChanges.filter((d) => !appliedIds.has(d.id)).map((d) => d.id)))}
                      className="text-primary hover:underline">Select all {syncAllChangedCount}</button>
                    <span className="text-muted-foreground">·</span>
                    <button onClick={() => setSelectedSync(new Set())} className="text-muted-foreground hover:text-foreground">None</button>
                    <span className="text-muted-foreground">· {selectedNotApplied} selected</span>
                  </div>
                )}

                {/* Diff cards — only changed restaurants */}
                {diffsWithChanges.length > 0 ? (
                  <div className="space-y-2">
                    {diffsWithChanges.map((diff) => {
                      const isApplied = appliedIds.has(diff.id);
                      const isSel = selectedSync.has(diff.id);
                      const ratingChange = diff.changes.find((c) => c.field === "yelp_rating");
                      const reviewChange = diff.changes.find((c) => c.field === "review_count");
                      const tierChange = diff.changes.find((c) => c.field === "price_tier");
                      const urlChange = diff.changes.find((c) => c.field === "yelp_url");
                      const displayName = diff.name || diff.yelp_id || diff.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] || "Unknown restaurant";

                      return (
                        <div key={diff.id}
                          className={`rounded-xl border px-4 py-3 transition-colors ${
                            isApplied ? "border-green-500/20 bg-green-500/5 opacity-70" :
                            isSel ? "border-primary/30 bg-primary/5" :
                            "border-yellow-500/20 bg-yellow-500/5"
                          }`}>
                          <div className="flex items-center gap-3">
                            {!isApplied ? (
                              <div onClick={() => setSelectedSync((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                                className={`w-4 h-4 rounded border shrink-0 cursor-pointer flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                                {isSel && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                              </div>
                            ) : <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}

                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-sm font-semibold truncate">{displayName}</span>
                              {diff.neighborhood && <span className="text-xs text-muted-foreground shrink-0">{diff.neighborhood}</span>}
                              {isApplied && <span className="text-xs text-green-500 shrink-0">Applied</span>}
                            </div>

                            {diff.yelp_url && (
                              <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                                Yelp <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>

                          <ul className="mt-2 ml-7 space-y-1">
                            {ratingChange && (
                              <li className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground w-20 shrink-0">Rating</span>
                                <DiffValue cur={ratingChange.old as number} next={ratingChange.new as number} />
                              </li>
                            )}
                            {reviewChange && (
                              <li className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground w-20 shrink-0">Reviews</span>
                                <DiffValue cur={reviewChange.old as number} next={reviewChange.new as number} fmt={(v) => Number(v).toLocaleString()} />
                              </li>
                            )}
                            {tierChange && (
                              <li className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground w-20 shrink-0">Price tier</span>
                                <DiffValue cur={tierChange.old as string} next={tierChange.new as string} />
                              </li>
                            )}
                            {urlChange && (
                              <li className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground w-20 shrink-0">Yelp URL</span>
                                <span className="text-xs text-muted-foreground truncate max-w-xs">{urlChange.new as string}</span>
                              </li>
                            )}
                            {diff.yelp?.categories?.length ? (
                              <li className="flex items-start gap-2 text-sm">
                                <span className="text-muted-foreground w-20 shrink-0">Categories</span>
                                <div className="flex flex-wrap gap-1">
                                  {diff.yelp.categories.map((cat) => (
                                    <span key={cat} className={`text-xs px-1.5 py-0.5 rounded border ${
                                      cat === "koreanbbq"
                                        ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 font-medium"
                                        : "bg-secondary border-border text-muted-foreground"
                                    }`}>{cat}</span>
                                  ))}
                                </div>
                              </li>
                            ) : null}
                          </ul>

                          {diff.error && <p className="mt-1.5 ml-7 text-xs text-muted-foreground/60">{diff.error}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">✓ All data is up to date.</p>
                )}

                {/* Apply bar */}
                {diffsWithChanges.length > 0 && (
                  <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border pt-3 flex items-center justify-between gap-4 flex-wrap">
                    {applyProgress && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1">
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-40">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(applyProgress.done / applyProgress.total) * 100}%` }} />
                        </div>
                        {applyProgress.done}/{applyProgress.total} updated
                      </div>
                    )}
                    {!applyProgress && <div className="flex-1" />}
                    <button onClick={applySelected} disabled={applying || selectedNotApplied === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
                      <CheckCircle className="w-4 h-4" />
                      {applying ? `Applying… ${applyProgress?.done ?? 0}/${applyProgress?.total ?? 0}` : `Apply ${selectedNotApplied} update${selectedNotApplied !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Section 3: Link to Yelp ──────────────────────────────────── */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Link Restaurants to Yelp</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Searches Yelp by name for each restaurant without a Yelp ID. Once linked, they&apos;ll be included in future sync checks.
                </p>
              </div>
              <button onClick={runLinkScan} disabled={linkScanning}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0 transition-colors">
                <RefreshCw className={`w-4 h-4 ${linkScanning ? "animate-spin" : ""}`} />
                {linkScanning ? "Scanning…" : "Scan Unlinked (takes ~1 min)"}
              </button>
            </div>

            {linkError && <ErrorBox msg={linkError} />}
            {linkScanning && <LoadingSpinner label="Searching Yelp for each unlinked restaurant…" />}

            {linkResults && !linkScanning && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">{linkResults.length} restaurant{linkResults.length !== 1 ? "s" : ""} need Yelp links</p>
                {linkResults.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-500">
                    <CheckCircle className="w-4 h-4" /> All restaurants have Yelp links.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkResults.map((result) => {
                      const isLinked = savedLinks.has(result.id);
                      const isSaving = savingLink === result.id;
                      return (
                        <div key={result.id} className="rounded-xl border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-sm font-semibold">{result.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{result.neighborhood}</span>
                            </div>
                            {isLinked && (
                              <span className="flex items-center gap-1 text-xs text-green-500 font-medium shrink-0">
                                <CheckCircle className="w-3.5 h-3.5" /> Linked
                              </span>
                            )}
                          </div>
                          {result.candidates.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No Yelp matches found</p>
                          ) : (
                            <div className="space-y-1.5">
                              {result.candidates.slice(0, 3).map((c) => {
                                const nameMismatch = !c.name.toLowerCase().includes(result.name.split(" ")[0].toLowerCase());
                                return (
                                  <div key={c.yelp_id} className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {nameMismatch && <span title="Name doesn't closely match" className="text-yellow-500 text-xs">⚠</span>}
                                        <span className="text-sm font-medium">{c.name}</span>
                                        <span className="text-xs text-muted-foreground">★ {c.rating}</span>
                                        <span className="text-xs text-muted-foreground">· {c.review_count} reviews</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {c.address}
                                        {c.categories.length > 0 && <span className="opacity-70"> · {c.categories.slice(0, 2).join(", ")}</span>}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                      {!isLinked && (
                                        <button onClick={() => saveLink(result.id, c.yelp_id, c.url)}
                                          disabled={isSaving}
                                          className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors">
                                          {isSaving ? "Saving…" : "Link"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

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
