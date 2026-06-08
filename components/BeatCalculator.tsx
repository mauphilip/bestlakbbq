"use client";

import { useState } from "react";
import type { CalculatorItem } from "@/lib/types";
import { Plus, Minus, TrendingUp, TrendingDown } from "lucide-react";

type Props = { items: CalculatorItem[] };
type Order = Record<string, number>; // id -> oz eaten

export default function BeatCalculator({ items }: Props) {
  const [orders, setOrders] = useState<Order>({});
  const [people, setPeople] = useState(2);
  const [restaurantTotal, setRestaurantTotal] = useState("");

  function adjust(id: string, delta: number) {
    setOrders((prev) => {
      const cur = prev[id] ?? 0;
      const next = Math.max(0, cur + delta);
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }

  const totals = items.reduce(
    (acc, item) => {
      const oz = orders[item.id] ?? 0;
      if (!oz) return acc;
      const lbs = oz / 16;
      acc.costco += lbs * item.costco_price_per_lb;
      acc.hmart += lbs * item.hmart_price_per_lb;
      acc.totalOz += oz;
      return acc;
    },
    { costco: 0, hmart: 0, totalOz: 0 }
  );

  const paid = parseFloat(restaurantTotal) || 0;
  const beatCostco = paid > 0 ? paid - totals.costco : null;
  const beatHmart = paid > 0 ? paid - totals.hmart : null;

  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <div className="space-y-6">
      {/* Setup */}
      <div className="flex items-center gap-6">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">People at table</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-white/5 transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center font-bold text-lg">{people}</span>
            <button
              onClick={() => setPeople((p) => p + 1)}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-white/5 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">
            Total restaurant bill ($)
          </label>
          <input
            type="number"
            value={restaurantTotal}
            onChange={(e) => setRestaurantTotal(e.target.value)}
            placeholder="e.g. 120"
            className="w-32 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Meat items */}
      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 capitalize">
            {cat}
          </h3>
          <div className="space-y-2">
            {items.filter((i) => i.category === cat).map((item) => {
              const oz = orders[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 bg-card/50 rounded-lg border border-border/50 px-4 py-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Costco ~${item.costco_price_per_lb}/lb · H-Mart ~${item.hmart_price_per_lb}/lb
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjust(item.id, -4)}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-16 text-center text-sm">
                      {oz > 0 ? `${oz} oz` : <span className="text-muted-foreground/50">0 oz</span>}
                    </span>
                    <button
                      onClick={() => adjust(item.id, 4)}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Results */}
      {totals.totalOz > 0 && (
        <div className="rounded-xl border border-border bg-card/80 p-6 space-y-4">
          <h2 className="font-bold text-lg">Your Haul</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-2xl font-bold">{totals.totalOz} oz</p>
              <p className="text-xs text-muted-foreground mt-1">Total meat eaten</p>
              <p className="text-xs text-muted-foreground">({(totals.totalOz / 16).toFixed(1)} lbs)</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-2xl font-bold">${totals.costco.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Costco retail value</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-2xl font-bold">${totals.hmart.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">H-Mart retail value</p>
            </div>
          </div>

          {paid > 0 && beatCostco !== null && (
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                Did you beat it?
              </h3>
              <div className="space-y-2">
                {[
                  { label: "vs. Costco", diff: beatCostco },
                  { label: "vs. H-Mart", diff: beatHmart! },
                ].map(({ label, diff }) => (
                  <div key={label} className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-3">
                    <span className="text-sm">{label}</span>
                    <div className={`flex items-center gap-2 font-bold ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
                      {diff > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {diff > 0
                        ? `You overpaid by $${diff.toFixed(2)}`
                        : `You beat it by $${Math.abs(diff).toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Per person: you paid ${(paid / people).toFixed(2)} · ate ${(totals.costco / people).toFixed(2)} Costco value
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Retail prices are estimates based on typical Costco/H-Mart pricing as of {items[0]?.updated_at}. Adjust quantities in 4 oz increments. AYCE restaurants typically serve ~3–4 oz portions per plate.
      </p>
    </div>
  );
}
