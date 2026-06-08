"use client";

import { useState } from "react";
import { Search, CheckCircle, AlertTriangle, XCircle, Plus, ExternalLink } from "lucide-react";
import type { Restaurant } from "@/lib/types";
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

const KBBQ_ALIASES = ["koreanbbq", "kbbq", "korean_bbq"];

function kbbqStatus(biz: YelpBusiness): "yes" | "maybe" | "no" {
  const aliases = biz.categories.map((c) => c.alias.toLowerCase());
  const titles = biz.categories.map((c) => c.title.toLowerCase());
  if (aliases.some((a) => KBBQ_ALIASES.includes(a))) return "yes";
  if (titles.some((t) => t.includes("korean") && t.includes("bbq"))) return "yes";
  if (aliases.some((a) => a.includes("korean"))) return "maybe";
  return "no";
}

function toRestaurantPartial(biz: YelpBusiness): Partial<Restaurant> {
  return {
    id: biz.id,
    name: biz.name,
    neighborhood: biz.location.city,
    ayce: true,
    ayce_tiers: [{ label: "Standard", price: 0 }],
    non_ayce_est_per_person: null,
    yelp_rating: biz.rating,
    google_rating: biz.rating,
    review_count: biz.review_count,
    yelp_url: biz.url,
    notes: "",
  };
}

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
  const [results, setResults] = useState<YelpBusiness[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addTarget, setAddTarget] = useState<Partial<Restaurant> | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({
        path: "/businesses/search",
        term: query + " Korean BBQ",
        location: "Los Angeles, CA",
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
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search Yelp for a restaurant…"
            className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No results found.</p>
      )}

      <div className="space-y-2">
        {results.map((biz) => {
          const status = kbbqStatus(biz);
          return (
            <div key={biz.id} className="flex items-start gap-3 bg-secondary border border-border rounded-xl p-3">
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
                  onClick={() => setAddTarget(toRestaurantPartial(biz))}
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
        })}
      </div>

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
