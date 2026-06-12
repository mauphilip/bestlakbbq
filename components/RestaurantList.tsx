"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { Restaurant, PriceTier } from "@/lib/types";
import { KBBQ_PRICE_RANGES } from "@/lib/types";
import { ExternalLink, ArrowUpDown, Globe, AlertTriangle, ChevronDown, ChevronUp, Star } from "lucide-react";

type SortKey = "cost" | "rating" | "value" | "reviews";

const RATING_OPTIONS = [0, 3.5, 4, 4.5] as const;
const REVIEW_OPTIONS = [0, 100, 500, 1000] as const;
const PRICE_TIERS = Object.keys(KBBQ_PRICE_RANGES) as PriceTier[];

/** Effective price tier: Yelp's when present, else bucketed from the known cost. */
function getPriceTier(r: Restaurant): PriceTier | null {
  if (r.price_tier) return r.price_tier;
  const cost = getMinCost(r);
  if (!cost) return null;
  if (cost < KBBQ_PRICE_RANGES["$$"].low) return "$";
  if (cost < KBBQ_PRICE_RANGES["$$$"].low) return "$$";
  if (cost < KBBQ_PRICE_RANGES["$$$$"].low) return "$$$";
  return "$$$$";
}

function getMinCost(r: Restaurant): number {
  if (r.ayce && r.ayce_tiers.length) return Math.min(...r.ayce_tiers.map((t) => t.price));
  return r.non_ayce_est_per_person ?? 0;
}

function getAvgRating(r: Restaurant): number {
  return r.yelp_rating;
}

function getValueScore(r: Restaurant): number {
  const cost = getMinCost(r);
  if (!cost) return 0;
  return getAvgRating(r) / cost * 100;
}

interface Props {
  restaurants: Restaurant[];
  /** Spots below the quality threshold — rendered in a collapsed "Go at your own risk" section. */
  risky?: Restaurant[];
  /** The active rating threshold, shown in the risky section header. */
  minRating?: number;
}

export default function RestaurantList({ restaurants, risky = [], minRating }: Props) {
  const [filter, setFilter] = useState<"all" | "ayce" | "non-ayce">("all");
  const [neighborhood, setNeighborhood] = useState("All");
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [minReviewsFilter, setMinReviewsFilter] = useState(0);
  const [tierFilter, setTierFilter] = useState<Set<PriceTier>>(new Set());
  const [sort, setSort] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [riskyOpen, setRiskyOpen] = useState(false);

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(key); setSortDir("desc"); }
  }

  // Neighborhood options derived from the data (imports add new areas over time)
  const neighborhoods = useMemo(
    () => ["All", ...Array.from(new Set([...restaurants, ...risky].map((r) => r.neighborhood))).sort()],
    [restaurants, risky]
  );

  const applyFilters = (list: Restaurant[]) => list.filter((r) => {
    if (filter === "ayce" && !r.ayce) return false;
    if (filter === "non-ayce" && r.ayce) return false;
    if (neighborhood !== "All" && r.neighborhood !== neighborhood) return false;
    if (minRatingFilter > 0 && r.yelp_rating < minRatingFilter) return false;
    if (minReviewsFilter > 0 && r.review_count < minReviewsFilter) return false;
    if (tierFilter.size > 0) {
      const tier = getPriceTier(r);
      if (!tier || !tierFilter.has(tier)) return false;
    }
    return true;
  });

  const applySort = (list: Restaurant[]) => [...list].sort((a, b) => {
    let av = 0, bv = 0;
    if (sort === "cost") { av = getMinCost(a); bv = getMinCost(b); }
    if (sort === "rating") { av = getAvgRating(a); bv = getAvgRating(b); }
    if (sort === "value") { av = getValueScore(a); bv = getValueScore(b); }
    if (sort === "reviews") { av = a.review_count; bv = b.review_count; }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const sorted = useMemo(() => applySort(applyFilters(restaurants)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restaurants, filter, neighborhood, minRatingFilter, minReviewsFilter, tierFilter, sort, sortDir]);

  const sortedRisky = useMemo(() => applySort(applyFilters(risky)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [risky, filter, neighborhood, minRatingFilter, minReviewsFilter, tierFilter, sort, sortDir]);

  const maxReviews = useMemo(
    () => Math.max(1, ...restaurants.map((r) => r.review_count)),
    [restaurants]
  );
  const maxValueScore = useMemo(
    () => Math.max(0.001, ...restaurants.map(getValueScore)),
    [restaurants]
  );

  function SortButton({ label, k }: { label: string; k: SortKey }) {
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
          sort === k ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 sm:gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm w-full sm:w-auto">
          {(["all", "ayce", "non-ayce"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              {f === "all" ? "All" : f === "ayce" ? "AYCE" : "Non-AYCE"}
            </button>
          ))}
        </div>
        <select
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-auto"
        >
          {neighborhoods.map((n) => (
            <option key={n} value={n}>{n === "All" ? "All Neighborhoods" : n}</option>
          ))}
        </select>
        <select
          value={minRatingFilter}
          onChange={(e) => setMinRatingFilter(Number(e.target.value))}
          className="text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-auto"
        >
          {RATING_OPTIONS.map((v) => (
            <option key={v} value={v}>{v === 0 ? "Any rating" : `★ ${v.toFixed(1)}+`}</option>
          ))}
        </select>
        <select
          value={minReviewsFilter}
          onChange={(e) => setMinReviewsFilter(Number(e.target.value))}
          className="text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-auto"
        >
          {REVIEW_OPTIONS.map((v) => (
            <option key={v} value={v}>{v === 0 ? "Any reviews" : `${v.toLocaleString()}+ reviews`}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {PRICE_TIERS.map((tier) => {
            const active = tierFilter.has(tier);
            return (
              <button
                key={tier}
                onClick={() => setTierFilter((prev) => {
                  const next = new Set(prev);
                  if (active) next.delete(tier); else next.add(tier);
                  return next;
                })}
                title={KBBQ_PRICE_RANGES[tier].label + "/pp"}
                className={`px-2.5 py-2 rounded-lg border text-sm transition-colors ${
                  active ? "bg-primary/15 border-primary/40 text-primary font-medium" : "border-border text-muted-foreground hover:border-foreground/20"
                }`}
              >
                {tier}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{sorted.length} restaurants</span>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 bg-card border-b border-border text-xs font-medium text-muted-foreground">
          <span>Restaurant</span>
          <SortButton label="Cost" k="cost" />
          <SortButton label="Rating" k="rating" />
          <SortButton label="Value" k="value" />
          <SortButton label="Reviews" k="reviews" />
          <span>Yelp</span>
        </div>

        {sorted.map((r, i) => {
          const minCost = getMinCost(r);
          const maxCost = r.ayce && r.ayce_tiers.length ? Math.max(...r.ayce_tiers.map((t) => t.price)) : null;
          const avgRating = getAvgRating(r);
          const valueScore = getValueScore(r);
          const isValuePick = valueScore > maxValueScore * 0.75 && minCost <= 40;
          const reviewPct = r.review_count / maxReviews;

          return (
            <div
              key={r.id}
              className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-foreground/2 transition-colors ${
                i % 2 === 0 ? "" : "bg-foreground/[0.01]"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.name}</span>
                  {r.featured && (
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" aria-label="Favorite" />
                  )}
                  {isValuePick && (
                    <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs h-4 px-1.5">
                      Value Pick
                    </Badge>
                  )}
                  <Badge variant={r.ayce ? "default" : "secondary"} className="text-xs h-4 px-1.5">
                    {r.ayce ? "AYCE" : "Non-AYCE"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.neighborhood}</p>
              </div>
              <div className="text-right text-sm">
                <span className="font-medium">${minCost}</span>
                {maxCost && maxCost !== minCost && <span className="text-muted-foreground">–${maxCost}</span>}
                {!r.ayce && <span className="text-muted-foreground text-xs block">est.</span>}
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">⭐ {avgRating.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Yelp</div>
              </div>
              <div className="w-16">
                <div className="text-xs text-muted-foreground mb-1 text-right">{valueScore.toFixed(1)}</div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(valueScore / maxValueScore) * 100}%` }} />
                </div>
              </div>
              <div className="w-14">
                <div className="text-xs text-muted-foreground mb-1 text-right">{(r.review_count / 1000).toFixed(1)}k</div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${reviewPct * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.website && (
                  <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" title="Visit website">
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {r.yelp_url ? (
                  <a href={r.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors" title="View on Yelp">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : !r.website ? <span className="text-muted-foreground/30">—</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile card list ── */}
      <div className="md:hidden space-y-2">
        {/* Sort bar */}
        <div className="flex items-center gap-3 px-1 pb-1 border-b border-border text-xs">
          <span className="text-muted-foreground">Sort:</span>
          {(["value", "cost", "rating", "reviews"] as const).map((k) => (
            <button
              key={k}
              onClick={() => toggleSort(k)}
              className={`capitalize transition-colors ${sort === k ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              {k}
            </button>
          ))}
        </div>

        {sorted.map((r) => {
          const minCost = getMinCost(r);
          const maxCost = r.ayce && r.ayce_tiers.length ? Math.max(...r.ayce_tiers.map((t) => t.price)) : null;
          const avgRating = getAvgRating(r);
          const valueScore = getValueScore(r);
          const isValuePick = valueScore > maxValueScore * 0.75 && minCost < 35;

          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm">{r.name}</span>
                  {r.featured && (
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" aria-label="Favorite" />
                  )}
                  {isValuePick && (
                    <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs h-4 px-1.5">
                      Value Pick
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{r.neighborhood} · {r.ayce ? "AYCE" : "Non-AYCE"}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span>
                    <span className="font-medium">${minCost}</span>
                    {maxCost && maxCost !== minCost && <span className="text-muted-foreground">–${maxCost}</span>}
                    {!r.ayce && <span className="text-muted-foreground text-xs">/pp est.</span>}
                  </span>
                  <span className="text-muted-foreground">⭐ {avgRating.toFixed(1)}</span>
                  <span className="text-muted-foreground text-xs">{(r.review_count / 1000).toFixed(1)}k reviews</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-1">
                {r.website && (
                  <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground">
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {r.yelp_url && (
                  <a href={r.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── "Go at your own risk" section ── */}
      {risky.length > 0 && (
        <div className="rounded-xl border border-yellow-500/25 overflow-hidden mt-6">
          <button
            onClick={() => setRiskyOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Go at your own risk ({sortedRisky.length})
              <span className="text-xs font-normal text-muted-foreground hidden sm:inline">
                — below {minRating !== undefined ? `the ${minRating.toFixed(1)}★` : "the"} quality threshold
              </span>
            </span>
            {riskyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
          {riskyOpen && (
            <div className="divide-y divide-border/50 border-t border-yellow-500/15">
              {sortedRisky.map((r) => {
                const minCost = getMinCost(r);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 bg-card/50">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{r.name}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.neighborhood} · {r.ayce ? "AYCE" : "Non-AYCE"}
                        {minCost > 0 && <> · ${minCost}{!r.ayce && " est."}</>}
                      </p>
                    </div>
                    <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium shrink-0">⭐ {r.yelp_rating.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{(r.review_count / 1000).toFixed(1)}k</span>
                    {r.yelp_url && (
                      <a href={r.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
              {sortedRisky.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">None match the current filters.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
