"use client";

import { useState } from "react";
import { Search, CheckCircle, AlertTriangle, XCircle, Plus, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { kbbqConfidence, bizToRestaurantPartial } from "@/lib/yelp-shared";
import RestaurantForm from "./RestaurantForm";

interface YelpBusiness {
  id: string;
  name: string;
  image_url: string;
  url: string;
  rating: number;
  review_count: number;
  location: { address1: string; city: string };
  categories: { alias: string; title: string }[];
}

const CONFIDENCE_TO_STATUS = { high: "yes", medium: "maybe", low: "no" } as const;

const Badge = ({ status }: { status: "yes" | "maybe" | "no" }) => {
  if (status === "yes") return (
    <span className="flex items-center gap-1 text-xs font-medium text-green-500 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" /> KBBQ
    </span>
  );
  if (status === "maybe") return (
    <span className="flex items-center gap-1 text-xs font-medium text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> Maybe KBBQ
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> Not KBBQ
    </span>
  );
};

interface Props {
  token: string;
  onAdded: (r: Restaurant) => void;
}

export default function AdminSearchPanel({ token, onAdded }: Props) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Los Angeles, CA");
  const [results, setResults] = useState<YelpBusiness[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addTarget, setAddTarget] = useState<Partial<Restaurant> | null>(null);
  const [showLow, setShowLow] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({
        path: "/businesses/search",
        term: query,
        location: location.trim() || "Los Angeles, CA",
        limit: "10",
      });
      const res = await fetch(`/api/yelp?${params}`);
      const data = await res.json();
      setResults(data.businesses ?? []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Restaurant name…"
            className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Location (e.g. Koreatown, CA)"
          className="w-full sm:w-48 px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No results found.</p>
      )}

      {(() => {
        const mainResults = results.filter((b) => kbbqConfidence(b) !== "low");
        const lowResults = results.filter((b) => kbbqConfidence(b) === "low");

        const Card = ({ biz }: { biz: YelpBusiness }) => {
          const status = CONFIDENCE_TO_STATUS[kbbqConfidence(biz)];
          return (
            <div className="flex items-start gap-3 bg-secondary border border-border rounded-xl p-3">
              {biz.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={biz.image_url}
                  alt={biz.name}
                  className="w-14 h-14 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="font-medium text-sm">{biz.name}</span>
                  <Badge status={status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {biz.location.address1}, {biz.location.city}
                </p>
                <p className="text-xs text-muted-foreground">
                  ★ {biz.rating} · {biz.review_count.toLocaleString()} reviews
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {biz.categories.map((c) => c.title).join(", ")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => setAddTarget(bizToRestaurantPartial(biz))}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
                <a
                  href={biz.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2.5 py-1 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Yelp
                </a>
              </div>
            </div>
          );
        };

        return (
          <>
            <div className="space-y-2">
              {mainResults.map((biz) => <Card key={biz.id} biz={biz} />)}
            </div>

            {lowResults.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                <button onClick={() => setShowLow((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>Not KBBQ ({lowResults.length}) — review</span>
                  {showLow ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showLow && (
                  <div className="border-t border-border p-2 space-y-2">
                    {lowResults.map((biz) => <Card key={biz.id} biz={biz} />)}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Add form modal */}
      {addTarget && (
        <RestaurantForm
          initial={addTarget}
          token={token}
          onClose={() => setAddTarget(null)}
          onSaved={(r) => {
            onAdded(r);
            setAddTarget(null);
          }}
        />
      )}
    </div>
  );
}
