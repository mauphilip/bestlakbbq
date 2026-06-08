"use client";

import { useState, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import type { Restaurant } from "@/lib/types";

type Props = { restaurants: Restaurant[] };

interface ChartPoint {
  x: number;
  y: number;
  r: number;
  restaurant: Restaurant;
  isAyce: boolean;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}

const NEIGHBORHOODS = ["All", "Koreatown", "Mid-Wilshire", "Orange County", "SGV", "Gardena", "Glendale", "Torrance", "Rowland Heights"];

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const r = d.restaurant;
  const minPrice = r.ayce
    ? Math.min(...r.ayce_tiers.map((t) => t.price))
    : r.non_ayce_est_per_person ?? 0;
  const maxPrice = r.ayce
    ? Math.max(...r.ayce_tiers.map((t) => t.price))
    : null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm max-w-[220px]">
      <p className="font-semibold text-foreground mb-1">{r.name}</p>
      <p className="text-muted-foreground text-xs mb-2">{r.neighborhood}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Type</span>
          <Badge variant={r.ayce ? "default" : "secondary"} className="text-xs h-4">
            {r.ayce ? "AYCE" : "Non-AYCE"}
          </Badge>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Cost</span>
          <span className="font-medium">
            ${minPrice}{maxPrice && maxPrice !== minPrice ? `–$${maxPrice}` : ""}/pp
            {!r.ayce && <span className="text-muted-foreground text-xs ml-1">(est)</span>}
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
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-muted-foreground text-xs mb-1">AYCE Tiers</p>
          {r.ayce_tiers.map((t) => (
            <div key={t.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t.label}</span>
              <span>${t.price}/pp</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs mt-2">Updated {r.last_price_check}</p>
      {r.yelp_url && (
        <a
          href={r.yelp_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-xs text-primary hover:underline"
        >
          View on Yelp →
        </a>
      )}
    </div>
  );
}

export default function KBBQChart({ restaurants }: Props) {
  const [filter, setFilter] = useState<"all" | "ayce" | "non-ayce">("all");
  const [neighborhood, setNeighborhood] = useState("All");

  const filtered = useMemo(() => {
    return restaurants.filter((r) => {
      if (filter === "ayce" && !r.ayce) return false;
      if (filter === "non-ayce" && r.ayce) return false;
      if (neighborhood !== "All" && r.neighborhood !== neighborhood) return false;
      return true;
    });
  }, [restaurants, filter, neighborhood]);

  const data: ChartPoint[] = useMemo(() => {
    return filtered.map((r) => {
      const cost = r.ayce
        ? Math.min(...r.ayce_tiers.map((t) => t.price))
        : (r.non_ayce_est_per_person ?? 0);
      const rating = (r.yelp_rating + r.google_rating) / 2;
      const maxReviews = Math.max(...restaurants.map((x) => x.review_count));
      const bubbleR = 4 + (r.review_count / maxReviews) * 18;
      return { x: cost, y: rating, r: bubbleR, restaurant: r, isAyce: r.ayce };
    });
  }, [filtered, restaurants]);

  const avgCost = data.length ? data.reduce((s, d) => s + d.x, 0) / data.length : 35;
  const avgRating = data.length ? data.reduce((s, d) => s + d.y, 0) / data.length : 4.1;

  const ayceData = data.filter((d) => d.isAyce);
  const nonAyceData = data.filter((d) => !d.isAyce);

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
          {NEIGHBORHOODS.map((n) => (
            <option key={n} value={n}>{n === "All" ? "All Neighborhoods" : n}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} restaurants</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-primary inline-block" />
          AYCE
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          Non-AYCE (est.)
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Bubble size = review count</span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[480px] bg-card/50 rounded-xl border border-border p-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[15, 90]}
              name="Cost per person"
              label={{ value: "Cost per person ($)", position: "insideBottom", offset: -10, fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[3.5, 5]}
              name="Avg rating"
              label={{ value: "Avg Rating", angle: -90, position: "insideLeft", offset: 10, fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }} />
            <ReferenceLine x={avgCost} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" label={{ value: "avg cost", fill: "rgba(255,255,255,0.25)", fontSize: 10 }} />
            <ReferenceLine y={avgRating} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" label={{ value: "avg rating", fill: "rgba(255,255,255,0.25)", fontSize: 10 }} />
            {ayceData.length > 0 && (
              <Scatter
                name="AYCE"
                data={ayceData}
                fill="oklch(0.65 0.22 32)"
                fillOpacity={0.85}
                shape={(props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  const r = payload?.r ?? 8;
                  return <circle cx={cx} cy={cy} r={r} fill="oklch(0.65 0.22 32)" fillOpacity={0.8} stroke="oklch(0.75 0.22 32)" strokeWidth={1} />;
                }}
              />
            )}
            {nonAyceData.length > 0 && (
              <Scatter
                name="Non-AYCE"
                data={nonAyceData}
                fill="#3b82f6"
                fillOpacity={0.85}
                shape={(props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  const r = payload?.r ?? 8;
                  const half = r * 1.1;
                  return (
                    <polygon
                      points={`${cx},${cy - half} ${cx + half},${cy + half * 0.6} ${cx - half},${cy + half * 0.6}`}
                      fill="#3b82f6"
                      fillOpacity={0.8}
                      stroke="#60a5fa"
                      strokeWidth={1}
                    />
                  );
                }}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrant labels */}
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-2 text-center">
          <span className="text-green-400 font-medium">↖ Value Picks</span>
          <p>Low cost, high rating</p>
        </div>
        <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-2 text-center">
          <span className="text-purple-400 font-medium">Splurge-Worthy ↗</span>
          <p>High cost, high rating</p>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-2 text-center">
          <span className="text-yellow-400 font-medium">↙ Skip It</span>
          <p>Low cost, low rating</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2 text-center">
          <span className="text-red-400 font-medium">Overpriced ↘</span>
          <p>High cost, low rating</p>
        </div>
      </div>
    </div>
  );
}
