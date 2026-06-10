"use client";

import { useState, useMemo, useRef, useEffect, type CSSProperties } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";
import { Maximize2, Minimize2, Tag, EyeOff, Search, X, Globe } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";

type Props = { restaurants: Restaurant[] };

/** Restaurants above this cost are shown in a separate "Price Outliers" panel */
const OUTLIER_THRESHOLD = 65;

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
  if (cost < 35) return "#f59e0b";       // gold  (budget)
  if (cost < 45) return "#f97316";       // orange (mid)
  if (cost < 60) return "#ef4444";       // coral/red (premium)
  return "#991b1b";                      // dark red / maroon
}

/**
 * A safe Yelp link that never 404s: use the stored canonical /biz/ URL when present,
 * otherwise fall back to a Yelp search by name + neighborhood.
 */
function yelpLink(r: Restaurant): string {
  if (r.yelp_url && /yelp\.com\/biz\//.test(r.yelp_url)) return r.yelp_url;
  const desc = encodeURIComponent(r.name);
  const loc = encodeURIComponent(`${r.neighborhood ? r.neighborhood + ", " : ""}Los Angeles, CA`);
  return `https://www.yelp.com/search?find_desc=${desc}&find_loc=${loc}`;
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
      <p className="mt-2 text-xs text-muted-foreground/60 italic">Click dot to open Yelp</p>
    </div>
  );
}

/** SVG label rendered via custom shape — we abuse the shape prop to draw both the dot and its label */
function DotWithLabel(props: {
  cx?: number; cy?: number; payload?: ChartPoint; showLabels?: boolean; isFullscreen?: boolean; isDark?: boolean;
}) {
  const { cx = 0, cy = 0, payload, showLabels, isFullscreen, isDark = true } = props;
  if (!payload) return null;
  const { r, isAyce, color, opacity, restaurant } = payload;

  function handleClick() {
    window.open(yelpLink(restaurant), "_blank", "noopener,noreferrer");
  }

  const shapeProps = {
    fill: color, fillOpacity: opacity * 0.85,
    stroke: color, strokeOpacity: opacity, strokeWidth: 1.5,
    style: { cursor: "pointer", outline: "none", WebkitTapHighlightColor: "transparent" } as CSSProperties,
    onClick: handleClick,
  };

  const shape = isAyce ? (
    <circle cx={cx} cy={cy} r={r} {...shapeProps} />
  ) : (
    <polygon
      points={`${cx},${cy - r * 1.2} ${cx + r * 1.1},${cy + r * 0.8} ${cx - r * 1.1},${cy + r * 0.8}`}
      {...shapeProps}
    />
  );

  const labelVisible = showLabels && opacity > 0.3;
  const fontSize = isFullscreen ? 13 : 11;
  // Halo stroke so text is legible over any bubble color or dark background
  const haloColor = isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)";
  const textColor = isDark
    ? `rgba(255,255,255,${Math.min(opacity, 0.92)})`
    : `rgba(0,0,0,${Math.min(opacity, 0.80)})`;
  const maxLen = isFullscreen ? 28 : 22;
  const label = restaurant.name.length > maxLen
    ? restaurant.name.slice(0, maxLen - 1) + "…"
    : restaurant.name;

  return (
    <g>
      {shape}
      {labelVisible && (
        <text
          x={cx + r + 5}
          y={cy + 4}
          fontSize={fontSize}
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={textColor}
          stroke={haloColor}
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ChartInner({
  data, avgRating, avgCost, showLabels, isFullscreen, xDomain, yDomain, isDark,
}: {
  data: ChartPoint[]; avgRating: number; avgCost: number;
  showLabels: boolean; isFullscreen: boolean;
  xDomain: [number, number]; yDomain: [number, number];
  isDark: boolean;
}) {
  const ayceData = data.filter((d) => d.isAyce);
  const nonAyceData = data.filter((d) => !d.isAyce);
  const tickFill = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.55)";
  const gridStroke = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
  const refLineStroke = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.35)";
  const refLabelFill = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)";
  const cursorStroke = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 24, right: isFullscreen ? 120 : 100, bottom: 52, left: isFullscreen ? 16 : 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis
          dataKey="x"
          type="number"
          domain={xDomain}
          name="Avg Rating"
          label={{ value: "Average Rating →", position: "insideBottom", offset: -22, fill: tickFill, fontSize: isFullscreen ? 14 : 12 }}
          tick={{ fill: tickFill, fontSize: isFullscreen ? 12 : 11 }}
          tickCount={8}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={yDomain}
          name="Cost per person"
          label={{ value: "↑ Cost / person ($)", angle: -90, position: "insideLeft", offset: isFullscreen ? 18 : 16, fill: tickFill, fontSize: isFullscreen ? 14 : 12 }}
          tick={{ fill: tickFill, fontSize: isFullscreen ? 12 : 11 }}
          tickFormatter={(v) => `$${v}`}
          width={isFullscreen ? 52 : 44}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ strokeDasharray: "3 3", stroke: cursorStroke }}
        />
        <ReferenceLine x={avgRating} stroke={refLineStroke} strokeWidth={1.5}
          label={{ value: `avg ${avgRating.toFixed(2)}`, fill: refLabelFill, fontSize: isFullscreen ? 11 : 10, position: "insideTopRight" }} />
        <ReferenceLine y={avgCost} stroke={refLineStroke} strokeWidth={1.5}
          label={{ value: `avg $${Math.round(avgCost)}`, fill: refLabelFill, fontSize: isFullscreen ? 11 : 10, position: "insideTopRight" }} />

        {/* Quadrant labels — positioned at outer corners, away from data */}
        {(() => {
          const ql = {
            fontSize: isFullscreen ? 13 : 11,
            fontWeight: 700,
            fill: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)",
          };
          return <>
            {/* Bottom-right: high rating, low cost = Best Value */}
            <ReferenceArea x1={avgRating} x2={xDomain[1]} y1={yDomain[0]} y2={avgCost}
              fill="transparent" strokeOpacity={0}
              label={{ value: "Best Value", position: "insideBottomRight", ...ql }} />
            {/* Top-right: high rating, high cost = Worth the Splurge */}
            <ReferenceArea x1={avgRating} x2={xDomain[1]} y1={avgCost} y2={yDomain[1]}
              fill="transparent" strokeOpacity={0}
              label={{ value: "Worth the Splurge", position: "insideTopRight", ...ql }} />
            {/* Top-left: low rating, high cost = Skip It */}
            <ReferenceArea x1={xDomain[0]} x2={avgRating} y1={avgCost} y2={yDomain[1]}
              fill="transparent" strokeOpacity={0}
              label={{ value: "Skip It", position: "insideTopLeft", ...ql }} />
            {/* Bottom-left: low rating, low cost = Budget Pick */}
            <ReferenceArea x1={xDomain[0]} x2={avgRating} y1={yDomain[0]} y2={avgCost}
              fill="transparent" strokeOpacity={0}
              label={{ value: "Budget Pick", position: "insideBottomLeft", ...ql }} />
          </>;
        })()}

        {ayceData.length > 0 && (
          <Scatter name="AYCE" data={ayceData}
            shape={(p: { cx?: number; cy?: number; payload?: ChartPoint }) => (
              <DotWithLabel {...p} showLabels={showLabels} isFullscreen={isFullscreen} isDark={isDark} />
            )} />
        )}
        {nonAyceData.length > 0 && (
          <Scatter name="Non-AYCE" data={nonAyceData}
            shape={(p: { cx?: number; cy?: number; payload?: ChartPoint }) => (
              <DotWithLabel {...p} showLabels={showLabels} isFullscreen={isFullscreen} isDark={isDark} />
            )} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export default function KBBQChart({ restaurants }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
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

  const allPoints: ChartPoint[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filtered.map((r) => {
      const cost = r.ayce
        ? Math.min(...r.ayce_tiers.map((t) => t.price))
        : (r.non_ayce_est_per_person ?? 0);
      const rating = r.yelp_rating;
      // sqrt scaling so review-count disparity doesn't dominate bubble size
      const bubbleR = 5 + Math.sqrt(r.review_count / maxReviews) * 16;
      const color = costColor(cost);
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q);
      const opacity = q ? (matchesSearch ? 1 : 0.12) : 1;

      // Stable jitter — deterministic offset based on restaurant ID so dots
      // that share identical (rating, cost) don't stack. Same restaurant always
      // gets the same offset (no flicker on re-render).
      const hash = r.id.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0);
      const jitterX = ((hash & 0xff) / 255 - 0.5) * 0.06;        // ±0.03 rating units
      const jitterY = (((hash >> 8) & 0xff) / 255 - 0.5) * 2.5;  // ±1.25 cost units

      return { x: rating + jitterX, y: cost + jitterY, r: bubbleR, restaurant: r, isAyce: r.ayce, color, opacity };
    });
  }, [filtered, search, maxReviews]);

  // Split into main chart data and price outliers (shown separately)
  const data = allPoints.filter((d) => d.y <= OUTLIER_THRESHOLD);
  const outliers = allPoints.filter((d) => d.y > OUTLIER_THRESHOLD);

  const avgRating = data.length ? data.reduce((s, d) => s + d.x, 0) / data.length : 4.1;
  const avgCost = data.length ? data.reduce((s, d) => s + d.y, 0) / data.length : 35;

  // Dynamic domains — pad slightly beyond actual min/max so dots aren't clipped
  const xDomain: [number, number] = data.length
    ? [
        Math.floor((Math.min(...data.map((d) => d.x)) - 0.05) * 20) / 20,
        Math.ceil((Math.max(...data.map((d) => d.x)) + 0.05) * 20) / 20,
      ]
    : [3.5, 4.8];

  const yDomain: [number, number] = data.length
    ? [
        Math.floor(Math.min(...data.map((d) => d.y)) / 5) * 5 - 4,
        Math.min(
          Math.ceil(Math.max(...data.map((d) => d.y)) / 5) * 5 + 5,
          OUTLIER_THRESHOLD
        ),
      ]
    : [15, OUTLIER_THRESHOLD];

  const chartContent = (
    <ChartInner data={data} avgRating={avgRating} avgCost={avgCost}
      showLabels={showLabels} isFullscreen={fullscreen}
      xDomain={xDomain} yDomain={yDomain} isDark={isDark} />
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

      {/* Chart */}
      <div className="w-full h-[760px] bg-card/50 rounded-xl border border-border p-3 select-none [&_*]:outline-none">
        {chartContent}
      </div>

      {/* Price outliers panel */}
      {outliers.length > 0 && (
        <div className="bg-card/50 border border-border rounded-xl p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#991b1b] inline-block" />
            Premium / Not on chart (${OUTLIER_THRESHOLD}+/pp)
          </p>
          <div className="space-y-1">
            {outliers.map((d) => (
              <div key={d.restaurant.id}
                className="flex items-center gap-3 text-xs bg-secondary rounded-lg px-3 py-2">
                {d.isAyce
                  ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  : <svg width="8" height="8" viewBox="0 0 10 10" className="shrink-0"><polygon points="5,0 10,10 0,10" fill={d.color} /></svg>
                }
                <span className="font-medium flex-1 min-w-0 truncate">{d.restaurant.name}</span>
                <span className="text-muted-foreground shrink-0">{d.isAyce ? "AYCE" : "Non-AYCE"}</span>
                <span className="font-medium shrink-0">${d.y}/pp</span>
                <span className="text-muted-foreground shrink-0">★ {d.x.toFixed(2)}</span>
                {d.restaurant.website && (
                  <a href={d.restaurant.website} target="_blank" rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary shrink-0" title="Website">
                    <Globe className="w-3.5 h-3.5" />
                  </a>
                )}
                <a href={yelpLink(d.restaurant)} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline shrink-0">Yelp →</a>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-1.5"><svg width="10" height="10" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#f97316" fillOpacity="0.85" /></svg>Circle = AYCE</div>
            <div className="flex items-center gap-1.5"><svg width="10" height="10" viewBox="0 0 12 12"><polygon points="6,1 11,11 1,11" fill="#ef4444" fillOpacity="0.85" /></svg>Triangle = Non-AYCE (est.)</div>
            <div className="flex items-center gap-1.5 text-muted-foreground/60">Bubble size = review count</div>
            <div className="flex items-center gap-3 ml-auto">
              {[["< $35", "#f59e0b"], ["$35–44", "#f97316"], ["$45–59", "#ef4444"], ["$60+", "#991b1b"]].map(([label, color]) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* FS chart */}
          <div className="flex-1 p-4 select-none [&_*]:outline-none">
            <ChartInner data={data} avgRating={avgRating} avgCost={avgCost} showLabels={true} isFullscreen={true} xDomain={xDomain} yDomain={yDomain} isDark={isDark} />
          </div>
        </div>
      )}
    </div>
  );
}
