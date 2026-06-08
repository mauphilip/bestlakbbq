"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Maximize2, Minimize2, Tag, EyeOff, Search, X } from "lucide-react";
import type { Restaurant } from "@/lib/types";

type Props = { restaurants: Restaurant[] };

interface ChartPoint {
  x: number; // rating
  y: number; // cost
  r: number;
  restaurant: Restaurant;
  isAyce: boolean;
  color: string;
  opacity: number;
}

const NEIGHBORHOODS = [
  "All", "Koreatown", "Mid-Wilshire", "Orange County", "SGV",
  "Gardena", "Glendale", "Torrance", "Rowland Heights", "Van Nuys",
];

/** Cost → color matching original Tableau gradient */
function costColor(cost: number): string {
  if (cost < 25) return "#f59e0b";       // gold
  if (cost < 35) return "#f97316";       // orange
  if (cost < 45) return "#ef4444";       // coral/red
  return "#991b1b";                      // dark red / maroon
}

interface TooltipProps { active?: boolean; payload?: Array<{ payload: ChartPoint }> }

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const r = d.restaurant;
  const minPrice = r.ayce
    ? Math.min(...r.ayce_tiers.map((t) => t.price))
    : r.non_ayce_est_per_person ?? 0;
  const maxPrice = r.ayce ? Math.max(...r.ayce_tiers.map((t) => t.price)) : null;

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-2xl text-sm max-w-[230px] pointer-events-none">
      <p className="font-semibold text-foreground">{r.name}</p>
      <p className="text-muted-foreground text-xs mb-2">{r.neighborhood} · {r.ayce ? "AYCE" : "Non-AYCE (est.)"}</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Cost</span>
          <span className="font-medium" style={{ color: d.color }}>
            ${minPrice}{maxPrice && maxPrice !== minPrice ? `–$${maxPrice}` : ""}/pp
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Yelp</span>
          <span className="font-medium">⭐ {r.yelp_rating}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Google</span>
          <span className="font-medium">⭐ {r.google_rating}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Reviews</span>
          <span className="font-medium">{r.review_count.toLocaleString()}</span>
        </div>
      </div>
      {r.ayce && r.ayce_tiers.length > 1 && (
        <div className="mt-2 pt-2 border-t border-border space-y-0.5">
          <p className="text-muted-foreground text-xs font-medium mb-1">AYCE Tiers</p>
          {r.ayce_tiers.map((t) => (
            <div key={t.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t.label}</span>
              <span>${t.price}/pp</span>
            </div>
          ))}
        </div>
      )}
      {r.yelp_url && (
        <a href={r.yelp_url} target="_blank" rel="noopener noreferrer"
          className="block mt-2 text-xs text-primary hover:underline pointer-events-auto">
          View on Yelp →
        </a>
      )}
    </div>
  );
}

/** SVG label rendered via custom shape — we abuse the shape prop to draw both the dot and its label */
function DotWithLabel(props: {
  cx?: number; cy?: number; payload?: ChartPoint; showLabels?: boolean; isFullscreen?: boolean;
}) {
  const { cx = 0, cy = 0, payload, showLabels, isFullscreen } = props;
  if (!payload) return null;
  const { r, isAyce, color, opacity, restaurant } = payload;

  const shape = isAyce ? (
    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={opacity * 0.85}
      stroke={color} strokeOpacity={opacity} strokeWidth={1.5} />
  ) : (
    <polygon
      points={`${cx},${cy - r * 1.2} ${cx + r * 1.1},${cy + r * 0.8} ${cx - r * 1.1},${cy + r * 0.8}`}
      fill={color} fillOpacity={opacity * 0.85}
      stroke={color} strokeOpacity={opacity} strokeWidth={1.5}
    />
  );

  const labelVisible = showLabels && opacity > 0.3;
  const fontSize = isFullscreen ? 10 : 9;

  return (
    <g>
      {shape}
      {labelVisible && (
        <text
          x={cx + r + 3}
          y={cy + 3}
          fontSize={fontSize}
          fill={`rgba(255,255,255,${Math.min(opacity, 0.75)})`}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {restaurant.name.length > 18 ? restaurant.name.slice(0, 16) + "…" : restaurant.name}
        </text>
      )}
    </g>
  );
}

function ChartInner({
  data, avgRating, avgCost, showLabels, isFullscreen,
}: {
  data: ChartPoint[]; avgRating: number; avgCost: number;
  showLabels: boolean; isFullscreen: boolean;
}) {
  const ayceData = data.filter((d) => d.isAyce);
  const nonAyceData = data.filter((d) => !d.isAyce);
  const tickFill = "rgba(255,255,255,0.35)";
  const gridStroke = "rgba(255,255,255,0.04)";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 20, right: isFullscreen ? 40 : 20, bottom: 40, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis
          dataKey="x"
          type="number"
          domain={[3.4, 4.8]}
          name="Avg Rating"
          label={{ value: "Average Rating →", position: "insideBottom", offset: -18, fill: tickFill, fontSize: 11 }}
          tick={{ fill: tickFill, fontSize: 10 }}
          tickCount={8}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={[15, 85]}
          name="Cost per person"
          label={{ value: "↑ Cost / person ($)", angle: -90, position: "insideLeft", offset: 14, fill: tickFill, fontSize: 11 }}
          tick={{ fill: tickFill, fontSize: 10 }}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.08)" }}
        />
        <ReferenceLine x={avgRating} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4"
          label={{ value: "avg rating", fill: "rgba(255,255,255,0.2)", fontSize: 9, position: "top" }} />
        <ReferenceLine y={avgCost} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4"
          label={{ value: "avg cost", fill: "rgba(255,255,255,0.2)", fontSize: 9, position: "right" }} />

        {ayceData.length > 0 && (
          <Scatter name="AYCE" data={ayceData}
            shape={(p: { cx?: number; cy?: number; payload?: ChartPoint }) => (
              <DotWithLabel {...p} showLabels={showLabels} isFullscreen={isFullscreen} />
            )} />
        )}
        {nonAyceData.length > 0 && (
          <Scatter name="Non-AYCE" data={nonAyceData}
            shape={(p: { cx?: number; cy?: number; payload?: ChartPoint }) => (
              <DotWithLabel {...p} showLabels={showLabels} isFullscreen={isFullscreen} />
            )} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export default function KBBQChart({ restaurants }: Props) {
  const [filter, setFilter] = useState<"all" | "ayce" | "non-ayce">("all");
  const [neighborhood, setNeighborhood] = useState("All");
  const [search, setSearch] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close fullscreen on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFullscreen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => restaurants.filter((r) => {
    if (filter === "ayce" && !r.ayce) return false;
    if (filter === "non-ayce" && r.ayce) return false;
    if (neighborhood !== "All" && r.neighborhood !== neighborhood) return false;
    return true;
  }), [restaurants, filter, neighborhood]);

  const maxReviews = useMemo(() => Math.max(...restaurants.map((r) => r.review_count), 1), [restaurants]);

  const data: ChartPoint[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filtered.map((r) => {
      const cost = r.ayce
        ? Math.min(...r.ayce_tiers.map((t) => t.price))
        : (r.non_ayce_est_per_person ?? 0);
      const rating = (r.yelp_rating + r.google_rating) / 2;
      const bubbleR = 5 + (r.review_count / maxReviews) * 16;
      const color = costColor(cost);
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q);
      const opacity = q ? (matchesSearch ? 1 : 0.12) : 1;
      return { x: rating, y: cost, r: bubbleR, restaurant: r, isAyce: r.ayce, color, opacity };
    });
  }, [filtered, search, maxReviews]);

  const avgRating = data.length ? data.reduce((s, d) => s + d.x, 0) / data.length : 4.1;
  const avgCost = data.length ? data.reduce((s, d) => s + d.y, 0) / data.length : 35;

  const chartContent = (
    <ChartInner data={data} avgRating={avgRating} avgCost={avgCost}
      showLabels={showLabels} isFullscreen={fullscreen} />
  );

  const controls = (
    <div className="space-y-3">
      {/* Row 1: type filter + neighborhood + count */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm w-full sm:w-auto">
          {(["all", "ayce", "non-ayce"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 transition-colors ${
                filter === f ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              }`}>
              {f === "all" ? "All" : f === "ayce" ? "AYCE" : "Non-AYCE"}
            </button>
          ))}
        </div>
        <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}
          className="text-sm bg-card border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-auto">
          {NEIGHBORHOODS.map((n) => <option key={n}>{n === "All" ? "All Neighborhoods" : n}</option>)}
        </select>
        <span className="text-xs text-muted-foreground sm:ml-auto">{filtered.length} restaurants</span>
      </div>

      {/* Row 2: search + label toggle + fullscreen */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search & highlight…"
            className="w-full pl-8 pr-7 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={() => setShowLabels((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
            showLabels ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
          }`}>
          {showLabels ? <Tag className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Labels</span>
        </button>
        <button onClick={() => setFullscreen(true)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Expand</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {controls}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="rgba(255,255,255,0.5)" /></svg>
          AYCE
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 11,11 1,11" fill="rgba(255,255,255,0.5)" /></svg>
          Non-AYCE (est.)
        </div>
        <div className="flex items-center gap-3 ml-auto">
          {[["< $25", "#f59e0b"], ["$25–34", "#f97316"], ["$35–44", "#ef4444"], ["$45+", "#991b1b"]].map(([label, color]) => (
            <div key={label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[500px] bg-card/50 rounded-xl border border-border p-3">
        {chartContent}
      </div>

      {/* Quadrant labels */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-card border border-border/60 rounded-lg p-2.5">
          <p className="font-medium text-green-400 mb-0.5">↙ Sweet Spot</p>
          <p className="text-muted-foreground">Cheaper than avg, tastier than avg</p>
        </div>
        <div className="bg-card border border-border/60 rounded-lg p-2.5">
          <p className="font-medium text-purple-400 mb-0.5">↘ Worth the Splurge</p>
          <p className="text-muted-foreground">More expensive but top-rated</p>
        </div>
        <div className="bg-card border border-border/60 rounded-lg p-2.5">
          <p className="font-medium text-yellow-500/80 mb-0.5">↖ Budget Pick</p>
          <p className="text-muted-foreground">Cheap but ratings below avg</p>
        </div>
        <div className="bg-card border border-border/60 rounded-lg p-2.5">
          <p className="font-medium text-red-400/80 mb-0.5">↗ Overpriced</p>
          <p className="text-muted-foreground">More expensive, lower rated</p>
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* FS header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold">🔥 <span className="text-primary">Best</span> LA KBBQ</span>
              <span className="text-xs text-muted-foreground">Cost vs. Rating · {filtered.length} restaurants</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Search in fullscreen */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-8 pr-7 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary w-48" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button onClick={() => setShowLabels((v) => !v)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showLabels ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground"
                }`}>
                {showLabels ? <Tag className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                Labels
              </button>
              <button onClick={() => setFullscreen(false)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <Minimize2 className="w-4 h-4" /> Close
              </button>
            </div>
          </div>

          {/* FS legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground px-6 py-2 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-1.5"><svg width="10" height="10" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="rgba(255,255,255,0.5)" /></svg>Circle = AYCE</div>
            <div className="flex items-center gap-1.5"><svg width="10" height="10" viewBox="0 0 12 12"><polygon points="6,1 11,11 1,11" fill="rgba(255,255,255,0.5)" /></svg>Triangle = Non-AYCE</div>
            <div className="flex items-center gap-3 ml-auto">
              {[["< $25", "#f59e0b"], ["$25–34", "#f97316"], ["$35–44", "#ef4444"], ["$45+", "#991b1b"]].map(([label, color]) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* FS chart */}
          <div className="flex-1 p-4">
            <ChartInner data={data} avgRating={avgRating} avgCost={avgCost} showLabels={true} isFullscreen={true} />
          </div>
        </div>
      )}
    </div>
  );
}
