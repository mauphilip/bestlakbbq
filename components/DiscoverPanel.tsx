"use client";

import { useState, useEffect } from "react";
import {
  Download, RefreshCw, CheckCircle, AlertTriangle, ExternalLink,
  ChevronDown, ChevronUp, Clock, Radar,
} from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { DiscoverCandidate } from "@/lib/yelp-types";
import { SEED_LOCATIONS, SEED_REGIONS, locationsForRegion, type SeedRegion } from "@/lib/discover-locations";

interface Props {
  token: string;
  onImported: (restaurants: Restaurant[]) => void;
}

const CONFIDENCE_STYLES = {
  high: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-red-500/15 text-red-500 border-red-500/20",
} as const;
const CONFIDENCE_LABELS = { high: "KBBQ ✓", medium: "likely KBBQ", low: "not KBBQ?" } as const;

export default function DiscoverPanel({ token, onImported }: Props) {
  const [selectedLocations, setSelectedLocations] = useState<string[]>(SEED_LOCATIONS.map((l) => l.key));
  const [discovering, setDiscovering] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; region: SeedRegion } | null>(null);
  const [remainingRegions, setRemainingRegions] = useState<SeedRegion[]>([]);
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [discoverError, setDiscoverError] = useState("");
  const [discoverWarnings, setDiscoverWarnings] = useState<string[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [confLevels, setConfLevels] = useState<Set<"high" | "medium">>(new Set(["high", "medium"]));
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("All");

  // Load cached discover on mount
  useEffect(() => {
    loadDiscover(false);
  }, []); // eslint-disable-line

  // ── Derived ─────────────────────────────────────────────────────────────────
  const newCandidates = candidates.filter((c) => !c.already_tracked && !c.is_closed);
  const confFiltered = newCandidates.filter((c) =>
    c.kbbq_confidence !== "low" && confLevels.has(c.kbbq_confidence as "high" | "medium")
  );
  const availableNeighborhoods = ["All", ...Array.from(new Set(confFiltered.map((c) => c.neighborhood ?? "Unknown"))).sort()];
  const filteredNew = confFiltered.filter((c) =>
    neighborhoodFilter === "All" ? true : c.neighborhood === neighborhoodFilter
  );
  const highConfNew = newCandidates.filter((c) => c.kbbq_confidence === "high");
  const trackedCandidates = candidates.filter((c) => c.already_tracked);
  const lowConfNew = newCandidates.filter((c) => c.kbbq_confidence === "low");

  function applyScanResult(cands: DiscoverCandidate[]) {
    setCandidates(cands);
    setSelectedImport(new Set(
      cands.filter((c) => !c.already_tracked && !c.is_closed && c.kbbq_confidence === "high").map((c) => c.yelp_id)
    ));
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function loadDiscover(force: boolean, locations?: string[]) {
    setDiscovering(true);
    setDiscoverError("");
    setDiscoverWarnings([]);
    if (force) { setCandidates([]); setSelectedImport(new Set()); setImportedCount(0); setRemainingRegions([]); }
    try {
      let url = `/api/restaurants/yelp-discover${force ? "?refresh=1" : ""}`;
      if (force && locations && locations.length < SEED_LOCATIONS.length) {
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

      if (force && cands.length === 0 && warnings.length > 0) {
        throw new Error(`Yelp API returned errors for all locations:\n${warnings.slice(0, 3).join("\n")}${warnings.length > 3 ? `\n…and ${warnings.length - 3} more` : ""}`);
      }

      applyScanResult(cands);
      setLastFetched(data.lastFetched ?? null);
      setFromCache(!!data.fromCache);
      if (warnings.length) setDiscoverWarnings(warnings);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDiscoverError(msg);
    }
    setDiscovering(false);
  }

  /** Full LA+OC sweep, one region batch per request so no single call hits the
   *  function timeout. On a Yelp rate limit, everything scanned so far is already
   *  cached server-side — we surface the remaining regions to resume later. */
  async function scanAllRegions(regions: SeedRegion[] = SEED_REGIONS) {
    setDiscovering(true);
    setDiscoverError("");
    setDiscoverWarnings([]);
    setRemainingRegions([]);
    setImportedCount(0);
    const warnings: string[] = [];
    try {
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        setScanProgress({ current: i + 1, total: regions.length, region });
        const keys = locationsForRegion(region).map((l) => l.key);
        const res = await fetch(
          `/api/restaurants/yelp-discover?refresh=1&locations=${encodeURIComponent(keys.join(","))}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any = {};
        try { data = await res.json(); } catch { /* fall through to error below */ }
        if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);

        if (Array.isArray(data.errors)) warnings.push(...data.errors);
        applyScanResult(data.candidates ?? []);
        setLastFetched(data.lastFetched ?? null);
        setFromCache(false);

        if (data.rateLimited) {
          // Current region may be partially scanned — include it in the resume list
          setRemainingRegions(regions.slice(i));
          break;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDiscoverError(msg);
    }
    if (warnings.length) setDiscoverWarnings(warnings);
    setScanProgress(null);
    setDiscovering(false);
  }

  /** Import via the bulk endpoint — one request, zero Yelp API calls. */
  async function importIds(yelpIds: string[]) {
    if (!yelpIds.length) return;
    setImporting(true);
    setDiscoverError("");
    try {
      const res = await fetch("/api/restaurants/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ yelp_ids: yelpIds }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try { data = await res.json(); } catch { /* fall through */ }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);

      const imported: Restaurant[] = data.restaurants ?? [];
      setImportedCount((n) => n + (data.imported ?? imported.length));
      if (imported.length) {
        onImported(imported);
        const ids = new Set(imported.map((r) => r.yelp_id ?? r.id));
        setCandidates((prev) => prev.map((c) => (ids.has(c.yelp_id) ? { ...c, already_tracked: true } : c)));
        setSelectedImport((prev) => {
          const n = new Set(prev);
          for (const id of ids) if (id) n.delete(id);
          return n;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDiscoverError(`Import failed: ${msg}`);
    }
    setImporting(false);
  }

  function toggleConf(level: "high" | "medium") {
    setConfLevels((prev) => {
      const n = new Set(prev);
      n.has(level) ? n.delete(level) : n.add(level);
      return n;
    });
    setNeighborhoodFilter("All");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-0.5">
          <p className="text-sm text-muted-foreground">
            Searches Yelp for the <code className="text-xs bg-secondary px-1 rounded">koreanbbq</code> category across {SEED_LOCATIONS.length} locations covering LA County and Orange County. Shows restaurants Yelp returned that aren&apos;t already in your database. Results are cached for 30 days.
          </p>
          {lastFetched && (
            <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {fromCache ? "Cached · " : "Fetched · "}{new Date(lastFetched).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => scanAllRegions()} disabled={discovering}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Radar className={`w-4 h-4 ${discovering && scanProgress ? "animate-pulse" : ""}`} />
            {scanProgress ? `Scanning ${scanProgress.region}… ${scanProgress.current}/${scanProgress.total}` : "Scan all regions"}
          </button>
          <button onClick={() => loadDiscover(true, selectedLocations)} disabled={discovering}
            className="flex items-center gap-2 px-3 py-2 border border-border text-sm rounded-lg hover:border-foreground/30 disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${discovering && !scanProgress ? "animate-spin" : ""}`} />
            Scan selected
          </button>
        </div>
      </div>

      {/* Location chips, grouped by region */}
      <div className="space-y-1.5">
        {SEED_REGIONS.map((region) => {
          const locs = locationsForRegion(region);
          return (
            <div key={region} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-20 shrink-0">{region}:</span>
              {locs.map((loc) => {
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
            </div>
          );
        })}
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setSelectedLocations(SEED_LOCATIONS.map((l) => l.key))}
            className="text-primary hover:underline">All</button>
          <span className="text-muted-foreground">·</span>
          <button onClick={() => setSelectedLocations([])}
            className="text-muted-foreground hover:text-foreground">None</button>
          {selectedLocations.length < SEED_LOCATIONS.length && fromCache && (
            <span className="text-muted-foreground/70 italic">Filtering to selected areas — cached results show all areas.</span>
          )}
        </div>
      </div>

      {discoverError && <ErrorBox msg={discoverError} />}

      {remainingRegions.length > 0 && (
        <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 space-y-1">
          <p className="font-medium">⚠ Yelp rate limit reached — progress so far is saved.</p>
          <p className="text-xs opacity-80">
            Regions still to scan: {remainingRegions.join(", ")}. Resume when your quota resets (check the Yelp Connector tab).
          </p>
          <button onClick={() => scanAllRegions(remainingRegions)} disabled={discovering}
            className="text-xs underline hover:no-underline disabled:opacity-50">
            Resume scan now
          </button>
        </div>
      )}

      {discoverWarnings.length > 0 && !discoverError && (
        <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 space-y-0.5">
          <p className="font-medium">⚠ Some Yelp searches had partial errors — results may be incomplete:</p>
          {discoverWarnings.slice(0, 5).map((w, i) => <p key={i} className="opacity-80">{w}</p>)}
          {discoverWarnings.length > 5 && <p className="opacity-60">…and {discoverWarnings.length - 5} more</p>}
        </div>
      )}

      {discovering && (
        <LoadingSpinner label={scanProgress
          ? `Scanning ${scanProgress.region} (batch ${scanProgress.current} of ${scanProgress.total})…`
          : "Searching Yelp…"} />
      )}

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
              {trackedCandidates.length} already tracked
            </span>
            {lowConfNew.length > 0 && (
              <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20">
                {lowConfNew.length} probably-not-KBBQ hidden
              </span>
            )}
          </div>

          {/* One-click bulk import of everything Yelp tagged as KBBQ */}
          {highConfNew.length > 0 && (
            <div className="flex items-center justify-between gap-4 px-3 py-2.5 bg-green-500/5 border border-green-500/20 rounded-xl">
              <p className="text-sm">
                <span className="font-medium">{highConfNew.length} confirmed-KBBQ spots</span>
                <span className="text-muted-foreground"> ready to import in one click. &quot;Likely KBBQ&quot; ones stay below for manual review.</span>
              </p>
              <button onClick={() => importIds(highConfNew.map((c) => c.yelp_id))} disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0">
                <Download className="w-4 h-4" />
                {importing ? "Importing…" : `Import all ${highConfNew.length}`}
              </button>
            </div>
          )}

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {/* Confidence toggle chips */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0">Yelp tag:</span>
              {([["high", "High"], ["medium", "Likely"]] as const).map(([v, label]) => {
                const active = confLevels.has(v);
                return (
                  <button key={v} onClick={() => toggleConf(v)}
                    className={`px-2.5 py-1 rounded-md border transition-colors ${active ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"}`}>
                    {label}
                  </button>
                );
              })}
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
                  const lowRated = (c.yelp_rating ?? 0) < 3;
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
                          {lowRated && (
                            <span className="text-xs px-1.5 py-0.5 rounded border font-medium bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                              ★ under 3
                            </span>
                          )}
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
                <p className="text-xs text-muted-foreground">Imported as Non-AYCE with the price-tier midpoint as an estimated cost, flagged &quot;needs review&quot;. Set exact prices in the Manage tab.</p>
                <button onClick={() => importIds(filteredNew.filter((c) => selectedImport.has(c.yelp_id)).map((c) => c.yelp_id))}
                  disabled={importing || selectedImport.size === 0}
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
          {lowConfNew.length > 0 && (
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
        </>
      )}
    </div>
  );
}

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
