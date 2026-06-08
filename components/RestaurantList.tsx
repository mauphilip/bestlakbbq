"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { Restaurant } from "@/lib/types";
import { ExternalLink, ArrowUpDown } from "lucide-react";

type SortKey = "cost" | "rating" | "value" | "reviews";

const NEIGHBORHOODS = ["All", "Koreatown", "Mid-Wilshire", "Orange County", "SGV", "Gardena", "Glendale", "Torrance", "Rowland Heights"];

function getMinCost(r: Restaurant): number {
  if (r.ayce) return Math.min(...r.ayce_tiers.map((t) => t.price));
  return r.non_ayce_est_per_person ?? 0;
}

function getAvgRating(r: Restaurant): number {
  return (r.yelp_rating + r.google_rating) / 2;
}

function getValueScore(r: Restaurant): number {
  const cost = getMinCost(r);
  if (!cost) return 0;
  return getAvgRating(r) / cost * 100;
}

export default function RestaurantList({ restaurants }: { restaurants: Restaurant[] }) {
  const [filter, setFilter] = useState<"all" | "ayce" | "non-ayce">("all");
  const [neighborhood, setNeighborhood] = useState("All");
  const [sort, setSort] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(key); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    const filtered = restaurants.filter((r) => {
      if (filter === "ayce" && !r.ayce) return false;
      if (filter === "non-ayce" && r.ayce) return false;
      if (neighborhood !== "All" && r.neighborhood !== neighborhood) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      let av = 0, bv = 0;
      if (sort === "cost") { av = getMinCost(a); bv = getMinCost(b); }
      if (sort === "rating") { av = getAvgRating(a); bv = getAvgRating(b); }
      if (sort === "value") { av = getValueScore(a); bv = getValueScore(b); }
      if (sort === "reviews") { av = a.review_count; bv = b.review_count; }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [restaurants, filter, neighborhood, sort, sortDir]);

  const maxReviews = Math.max(...restaurants.map((r) => r.review_count));

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
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["all", "ayce", "non-ayce"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {f === "all" ? "All" : f === "ayce" ? "AYCE" : "Non-AYCE"}
            </button>
          ))}
        </div>
        <select
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="text-sm bg-card border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {NEIGHBORHOODS.map((n) => (
            <option key={n} value={n}>{n === "All" ? "All Neighborhoods" : n}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{sorted.length} restaurants</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 bg-card/80 border-b border-border text-xs font-medium text-muted-foreground">
          <span>Restaurant</span>
          <SortButton label="Cost" k="cost" />
          <SortButton label="Rating" k="rating" />
          <SortButton label="Value" k="value" />
          <SortButton label="Reviews" k="reviews" />
          <span>Yelp</span>
        </div>

        {sorted.map((r, i) => {
          const minCost = getMinCost(r);
          const maxCost = r.ayce ? Math.max(...r.ayce_tiers.map((t) => t.price)) : null;
          const avgRating = getAvgRating(r);
          const valueScore = getValueScore(r);
          const maxValueScore = Math.max(...restaurants.map(getValueScore));
          const isValuePick = valueScore > maxValueScore * 0.75 && minCost < 35;
          const reviewPct = r.review_count / maxReviews;

          return (
            <div
              key={r.id}
              className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-white/3 transition-colors ${
                i % 2 === 0 ? "" : "bg-white/1"
              }`}
            >
              {/* Name */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.name}</span>
                  {isValuePick && (
                    <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-xs h-4 px-1.5">
                      Value Pick
                    </Badge>
                  )}
                  <Badge
                    variant={r.ayce ? "default" : "secondary"}
                    className="text-xs h-4 px-1.5"
                  >
                    {r.ayce ? "AYCE" : "Non-AYCE"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.neighborhood}</p>
              </div>

              {/* Cost */}
              <div className="text-right text-sm">
                <span className="font-medium">${minCost}</span>
                {maxCost && maxCost !== minCost && (
                  <span className="text-muted-foreground">–${maxCost}</span>
                )}
                {!r.ayce && <span className="text-muted-foreground text-xs block">est.</span>}
              </div>

              {/* Rating */}
              <div className="text-right">
                <div className="text-sm font-medium">⭐ {avgRating.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Y:{r.yelp_rating} G:{r.google_rating}</div>
              </div>

              {/* Value bar */}
              <div className="w-16">
                <div className="text-xs text-muted-foreground mb-1 text-right">{valueScore.toFixed(1)}</div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(valueScore / maxValueScore) * 100}%` }}
                  />
                </div>
              </div>

              {/* Reviews */}
              <div className="w-14">
                <div className="text-xs text-muted-foreground mb-1 text-right">{(r.review_count / 1000).toFixed(1)}k</div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${reviewPct * 100}%` }}
                  />
                </div>
              </div>

              {/* Yelp link */}
              <div>
                {r.yelp_url ? (
                  <a
                    href={r.yelp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
                    title="View on Yelp"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <span className="text-muted-foreground/30">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
