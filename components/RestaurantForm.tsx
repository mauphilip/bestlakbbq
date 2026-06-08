"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { Restaurant, AyceTier } from "@/lib/types";

interface Props {
  initial?: Partial<Restaurant>;
  token: string;
  onClose: () => void;
  onSaved: (r: Restaurant) => void;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function RestaurantForm({ initial, token, onClose, onSaved }: Props) {
  const isNew = !initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood ?? "Koreatown");
  const [ayce, setAyce] = useState(initial?.ayce ?? true);
  const [tiers, setTiers] = useState<AyceTier[]>(
    initial?.ayce_tiers?.length ? initial.ayce_tiers : [{ label: "Standard", price: 0 }]
  );
  const [nonAyceCost, setNonAyceCost] = useState(initial?.non_ayce_est_per_person ?? 40);
  const [yelpRating, setYelpRating] = useState(initial?.yelp_rating ?? 4.0);
  const [googleRating, setGoogleRating] = useState(initial?.google_rating ?? 4.0);
  const [reviewCount, setReviewCount] = useState(initial?.review_count ?? 100);
  const [yelpUrl, setYelpUrl] = useState(initial?.yelp_url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const neighborhoods = [
    "Koreatown", "Rowland Heights", "Buena Park", "Gardena",
    "Torrance", "Irvine", "Cerritos", "Los Angeles", "Van Nuys",
    "Anaheim", "Fullerton", "Diamond Bar", "Alhambra", "Other"
  ];

  function addTier() {
    setTiers([...tiers, { label: "Tier " + (tiers.length + 1), price: 0 }]);
  }

  function updateTier(i: number, field: keyof AyceTier, value: string | number) {
    const next = [...tiers];
    next[i] = { ...next[i], [field]: field === "price" ? Number(value) : value };
    setTiers(next);
  }

  function removeTier(i: number) {
    setTiers(tiers.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");

    const id = initial?.id ?? slugify(name);
    const restaurant: Restaurant = {
      id,
      name: name.trim(),
      neighborhood,
      ayce,
      ayce_tiers: ayce ? tiers : [],
      non_ayce_est_per_person: ayce ? null : nonAyceCost,
      yelp_rating: yelpRating,
      google_rating: googleRating,
      review_count: reviewCount,
      last_price_check: new Date().toISOString().slice(0, 10),
      lat: initial?.lat ?? 34.058,
      lng: initial?.lng ?? -118.302,
      yelp_url: yelpUrl.trim(),
      notes: notes.trim(),
    };

    const url = isNew ? "/api/restaurants" : `/api/restaurants/${id}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(restaurant),
    });

    setSaving(false);
    if (res.ok) {
      onSaved(restaurant);
      onClose();
    } else {
      setError("Failed to save. Check your admin token.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold">{isNew ? "Add Restaurant" : "Edit Restaurant"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

          {/* Name */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Restaurant Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Park's BBQ"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Neighborhood */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Neighborhood</label>
            <select
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {neighborhoods.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>

          {/* AYCE toggle */}
          <div>
            <label className="text-sm font-medium block mb-2">Type</label>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setAyce(v)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    ayce === v
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}
                >
                  {v ? "AYCE" : "Non-AYCE"}
                </button>
              ))}
            </div>
          </div>

          {/* AYCE tiers / non-AYCE cost */}
          {ayce ? (
            <div>
              <label className="text-sm font-medium block mb-2">AYCE Tiers</label>
              <div className="space-y-2">
                {tiers.map((tier, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={tier.label}
                      onChange={(e) => updateTier(i, "label", e.target.value)}
                      placeholder="Label"
                      className="flex-1 bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        value={tier.price}
                        onChange={(e) => updateTier(i, "price", e.target.value)}
                        className="w-20 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    {tiers.length > 1 && (
                      <button onClick={() => removeTier(i)} className="text-muted-foreground hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addTier}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add tier
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium block mb-1.5">Est. Cost per Person ($)</label>
              <input
                type="number"
                value={nonAyceCost}
                onChange={(e) => setNonAyceCost(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {/* Ratings */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">Yelp Rating</label>
              <input
                type="number" step="0.1" min="1" max="5"
                value={yelpRating}
                onChange={(e) => setYelpRating(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Google Rating</label>
              <input
                type="number" step="0.1" min="1" max="5"
                value={googleRating}
                onChange={(e) => setGoogleRating(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Review Count</label>
              <input
                type="number" min="0"
                value={reviewCount}
                onChange={(e) => setReviewCount(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Yelp URL */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Yelp URL</label>
            <input
              value={yelpUrl}
              onChange={(e) => setYelpUrl(e.target.value)}
              placeholder="https://www.yelp.com/biz/..."
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything notable…"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0 sticky bottom-0 bg-card">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-foreground/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : isNew ? "Add Restaurant" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
