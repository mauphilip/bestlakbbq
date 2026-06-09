"use client";

import { useEffect, useState } from "react";
import type { Restaurant, Visit } from "@/lib/types";
import VisitCard from "@/components/VisitCard";
import VisitModal from "@/components/VisitModal";
export default function VisitedPage() {
  const [visits, setVisits] = useState<Record<string, Visit>>({});
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Restaurant | null>(null);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/visits").then((r) => r.json()),
      fetch("/api/restaurants").then((r) => r.json()),
    ]).then(([visitsArr, restaurants]: [Visit[], Restaurant[]]) => {
      const map: Record<string, Visit> = {};
      visitsArr.forEach((v) => { map[v.restaurantId] = v; });
      setVisits(map);
      setAllRestaurants(Array.isArray(restaurants) ? restaurants : []);
      setLoading(false);
    });
  }, []);

  const visitedRestaurants = allRestaurants.filter((r) => visits[r.id]?.visited);

  // Sort by personal rating desc, then alphabetical
  visitedRestaurants.sort((a, b) => {
    const rA = visits[a.id]?.personalRating ?? 0;
    const rB = visits[b.id]?.personalRating ?? 0;
    if (rB !== rA) return rB - rA;
    return a.name.localeCompare(b.name);
  });

  function handleSaved(v: Visit) {
    setVisits((prev) => ({ ...prev, [v.restaurantId]: v }));
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">My Visits</h1>
        <p className="text-muted-foreground mt-1">
          Your personal KBBQ log — {visitedRestaurants.length} restaurant{visitedRestaurants.length !== 1 ? "s" : ""} visited
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visitedRestaurants.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-2xl">
          <p className="text-2xl mb-2">🥩</p>
          <p className="font-semibold text-lg">No visits yet</p>
          <p className="text-muted-foreground text-sm mt-1">
            Head to the{" "}
            <a href="/list" className="text-primary underline underline-offset-2">
              Directory
            </a>{" "}
            and log your first KBBQ visit.
          </p>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex flex-wrap gap-4 mb-6">
            {[
              {
                label: "Avg. personal rating",
                value: (() => {
                  const rated = visitedRestaurants.filter((r) => visits[r.id]?.personalRating);
                  if (!rated.length) return "—";
                  const avg = rated.reduce((s, r) => s + (visits[r.id]?.personalRating ?? 0), 0) / rated.length;
                  return avg.toFixed(1) + " / 5";
                })(),
              },
              {
                label: "Would go back",
                value: visitedRestaurants.filter((r) => visits[r.id]?.wouldGoBack).length + " / " + visitedRestaurants.length,
              },
              {
                label: "AYCE visited",
                value: visitedRestaurants.filter((r) => r.ayce).length,
              },
              {
                label: "Non-AYCE visited",
                value: visitedRestaurants.filter((r) => !r.ayce).length,
              },
            ].map((stat) => (
              <div key={stat.label} className="stat-card px-4 py-3 rounded-xl min-w-[120px]">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-semibold mt-0.5">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visitedRestaurants.map((r) => (
              <VisitCard
                key={r.id}
                restaurant={r}
                visit={visits[r.id]}
                onEdit={() => setEditTarget(r)}
              />
            ))}
          </div>
        </>
      )}

      {/* Edit modal */}
      {editTarget && (
        <VisitModal
          restaurant={editTarget}
          existing={visits[editTarget.id]}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
