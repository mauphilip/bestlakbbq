"use client";

import { useState } from "react";
import { X, Plus, Trash2, ExternalLink, CheckCircle, AlertTriangle, Link2, Search, Globe } from "lucide-react";
import type { Restaurant, AyceTier, PriceTier } from "@/lib/types";
import { KBBQ_PRICE_RANGES } from "@/lib/types";
import { isYelpConnected, slugFromUrl, kbbqConfidence, type YelpBizLite } from "@/lib/yelp-shared";

interface Props {
  initial?: Partial<Restaurant>;
  token: string;
  onClose: () => void;
  onSaved: (r: Restaurant) => void;
  onDeleted?: (id: string) => void;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const NEIGHBORHOODS = [
  "Koreatown", "Mid-Wilshire", "Rowland Heights", "Buena Park", "Gardena",
  "Torrance", "Irvine", "Cerritos", "Los Angeles", "Van Nuys", "Orange County",
  "Anaheim", "Fullerton", "Diamond Bar", "Alhambra", "Glendale", "SGV", "Other",
];

const PRICE_TIERS: PriceTier[] = ["$$", "$$$", "$$$$"];

export default function RestaurantForm({ initial, token, onClose, onSaved, onDeleted }: Props) {
  const isNew = !initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood ?? "Koreatown");
  const [ayce, setAyce] = useState(initial?.ayce ?? true);
  const [tiers, setTiers] = useState<AyceTier[]>(
    initial?.ayce_tiers?.length ? initial.ayce_tiers : [{ label: "Standard", price: 0 }]
  );
  const [useExactPrice, setUseExactPrice] = useState(
    (initial?.ayce_tiers?.some((t) => t.price > 0) || !!initial?.non_ayce_est_per_person) ?? false
  );
  const [nonAyceCost, setNonAyceCost] = useState(initial?.non_ayce_est_per_person ?? 0);
  const [priceTier, setPriceTier] = useState<PriceTier>(initial?.price_tier ?? "$$$");
  const [priceVerified, setPriceVerified] = useState(initial?.price_verified ?? false);
  const [yelpRating, setYelpRating] = useState(initial?.yelp_rating ?? 4.0);
  const [reviewCount, setReviewCount] = useState(initial?.review_count ?? 100);
  const [yelpUrl, setYelpUrl] = useState(initial?.yelp_url ?? "");
  const [yelpId, setYelpId] = useState(initial?.yelp_id ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Yelp connection finder
  const [finding, setFinding] = useState(false);
  const [findResults, setFindResults] = useState<YelpBizLite[] | null>(null);
  const [findError, setFindError] = useState("");

  const connected = isYelpConnected({ yelp_id: yelpId, yelp_url: yelpUrl });
  const openUrl = yelpUrl || (yelpId ? `https://www.yelp.com/biz/${yelpId}` : "");

  async function findOnYelp() {
    if (!name.trim()) { setFindError("Enter a name first"); return; }
    setFinding(true); setFindError(""); setFindResults(null);
    try {
      const params = new URLSearchParams({
        path: "/businesses/search",
        term: name,
        location: `${neighborhood}, Los Angeles, CA`,
        categories: "koreanbbq",
        limit: "6",
      });
      const res = await fetch(`/api/yelp?${params}`);
      const data = await res.json();
      setFindResults((data.businesses ?? []) as YelpBizLite[]);
    } catch {
      setFindError("Search failed — try again.");
    }
    setFinding(false);
  }

  function linkBiz(biz: YelpBizLite) {
    setYelpId(biz.id);
    if (biz.url) setYelpUrl(biz.url.split("?")[0]);
    setFindResults(null);
  }

  function unlink() {
    setYelpId("");
    setYelpUrl("");
  }

  const estimatedRange = KBBQ_PRICE_RANGES[priceTier];

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

    // Determine effective cost for non-AYCE
    let effectiveCost: number | null = null;
    if (!ayce) {
      if (useExactPrice && nonAyceCost > 0) {
        effectiveCost = nonAyceCost;
      } else {
        effectiveCost = Math.round((estimatedRange.low + estimatedRange.high) / 2);
      }
    }

    // For AYCE tiers: if not using exact price, estimate from tier
    const effectiveTiers: AyceTier[] = ayce
      ? useExactPrice
        ? tiers
        : [{ label: "Estimated", price: estimatedRange.low }]
      : [];

    const restaurant: Restaurant = {
      ...(initial as Restaurant),
      id,
      name: name.trim(),
      neighborhood,
      ayce,
      ayce_tiers: effectiveTiers,
      non_ayce_est_per_person: effectiveCost,
      price_tier: priceTier,
      price_verified: priceVerified,
      yelp_rating: yelpRating,
      google_rating: 0,
      review_count: reviewCount,
      last_price_check: priceVerified ? new Date().toISOString().slice(0, 10) : (initial?.last_price_check ?? "2022-02-01"),
      last_yelp_sync: initial?.last_yelp_sync,
      lat: initial?.lat ?? 34.058,
      lng: initial?.lng ?? -118.302,
      yelp_url: yelpUrl.trim(),
      yelp_id: yelpId.trim() || slugFromUrl(yelpUrl) || undefined,
      website: website.trim() || undefined,
      notes: notes.trim(),
      kv_managed: true,
    };

    const url = isNew ? "/api/restaurants" : "/api/restaurants";
    const method = isNew ? "POST" : "POST"; // always POST — server upserts by ID

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

  async function handleDelete() {
    if (!initial?.id) return;
    if (!confirm(`Delete "${name}"? This removes it from the list.`)) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/restaurants/${initial.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { onDeleted?.(initial.id); onClose(); return; }
      setError("Failed to delete. Check your admin token.");
    } catch { setError("Failed to delete."); }
    setSaving(false);
  }

  const yelpMenuUrl = yelpUrl ? yelpUrl.replace(/\?.*/, "") + "?osq=Menu" : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h2 className="font-semibold">{isNew ? "Add Restaurant" : "Edit Restaurant"}</h2>
            {!isNew && !initial?.price_verified && (
              <p className="text-xs text-yellow-500 flex items-center gap-1 mt-0.5">
                <AlertTriangle className="w-3 h-3" /> Price not verified
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

          {/* Name */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Restaurant Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Moohan KBBQ"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* Neighborhood */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Neighborhood</label>
            <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              {NEIGHBORHOODS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>

          {/* AYCE toggle */}
          <div>
            <label className="text-sm font-medium block mb-2">Type</label>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => setAyce(v)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    ayce === v ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}>
                  {v ? "AYCE" : "Non-AYCE"}
                </button>
              ))}
            </div>
          </div>

          {/* Price tier (from Yelp) */}
          <div>
            <label className="text-sm font-medium block mb-1.5">
              Yelp Price Tier
              <span className="text-xs text-muted-foreground font-normal ml-1">(auto-synced from Yelp)</span>
            </label>
            <div className="flex gap-2">
              {PRICE_TIERS.map((tier) => (
                <button key={tier} onClick={() => setPriceTier(tier)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    priceTier === tier ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}>
                  <span>{tier}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{KBBQ_PRICE_RANGES[tier].label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Price entry mode */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                {ayce ? "AYCE Tiers" : "Est. Cost per Person"}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Use estimated range</span>
                <button onClick={() => setUseExactPrice((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${useExactPrice ? "bg-primary" : "bg-border"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useExactPrice ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <span className="text-xs text-muted-foreground">Exact</span>
              </div>
            </div>

            {!useExactPrice ? (
              <div className="bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-muted-foreground">
                Using estimated range: <span className="text-foreground font-medium">{estimatedRange.label}/pp</span>
                <span className="text-xs ml-1">(from {priceTier} tier)</span>
              </div>
            ) : ayce ? (
              <div className="space-y-2">
                {tiers.map((tier, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={tier.label} onChange={(e) => updateTier(i, "label", e.target.value)}
                      placeholder="Label"
                      className="flex-1 bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-sm">$</span>
                      <input type="number" inputMode="numeric" value={tier.price} onChange={(e) => updateTier(i, "price", e.target.value)}
                        className="w-20 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                    {tiers.length > 1 && (
                      <button onClick={() => removeTier(i)} className="text-muted-foreground hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addTier} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 mt-1">
                  <Plus className="w-3.5 h-3.5" /> Add tier
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <input type="number" inputMode="numeric" value={nonAyceCost} onChange={(e) => setNonAyceCost(Number(e.target.value))}
                  placeholder="e.g. 45"
                  className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="text-muted-foreground text-sm">per person</span>
              </div>
            )}

            {/* Price verified checkbox */}
            <label className="flex items-center gap-2 mt-2 cursor-pointer group">
              <div onClick={() => setPriceVerified((v) => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  priceVerified ? "bg-green-500 border-green-500" : "border-border group-hover:border-green-500/50"
                }`}>
                {priceVerified && <CheckCircle className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-muted-foreground">I've verified this price manually</span>
            </label>
          </div>

          {/* Yelp Connection */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Yelp Connection</label>
            {connected ? (
              <div className="flex items-center gap-2 flex-wrap bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" /> Connected
                </span>
                <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{yelpId || slugFromUrl(yelpUrl)}</span>
                <a href={openUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2.5 py-1 border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" /> Open on Yelp
                </a>
                <button type="button" onClick={unlink}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors shrink-0">Unlink</button>
              </div>
            ) : (
              <div className="bg-secondary/50 border border-border rounded-lg px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Link2 className="w-4 h-4" /> Not connected to Yelp
                  </span>
                  <button type="button" onClick={findOnYelp} disabled={finding}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
                    <Search className="w-3.5 h-3.5" /> {finding ? "Searching…" : "Find on Yelp"}
                  </button>
                </div>
                {findError && <p className="text-xs text-red-400">{findError}</p>}
                {findResults && findResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No Yelp matches found.</p>
                )}
                {findResults && findResults.length > 0 && (
                  <div className="space-y-1.5">
                    {findResults.map((biz) => {
                      const conf = kbbqConfidence(biz);
                      return (
                        <div key={biz.id} className="flex items-center gap-2 bg-card border border-border rounded-lg px-2.5 py-1.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium truncate">{biz.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                conf === "high" ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                                : conf === "medium" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                                : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
                                {conf === "high" ? "KBBQ" : conf === "medium" ? "maybe" : "not KBBQ?"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              ★ {biz.rating ?? "—"} · {(biz.review_count ?? 0).toLocaleString()} · {biz.location?.address1 ?? ""}
                            </p>
                          </div>
                          <button type="button" onClick={() => linkBiz(biz)}
                            className="flex items-center gap-1 text-xs px-2 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shrink-0">
                            <Link2 className="w-3 h-3" /> Link
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Yelp URL + menu link */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Yelp URL</label>
            <div className="flex gap-2">
              <input value={yelpUrl} onChange={(e) => { setYelpUrl(e.target.value); if (yelpId) setYelpId(""); }}
                placeholder="https://www.yelp.com/biz/..."
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              {yelpMenuUrl && (
                <a href={yelpMenuUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2.5 py-2 border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" /> Menu
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pasting a <code className="bg-secondary px-1 rounded">/biz/</code> URL also links it.
              {yelpMenuUrl && " Open the menu to verify prices."}
            </p>
          </div>

          {/* Website */}
          <div>
            <label className="text-sm font-medium block mb-1.5">
              Website <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input value={website} onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              {website.trim() && (
                <a href={website.trim()} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2.5 py-2 border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors shrink-0">
                  <Globe className="w-3.5 h-3.5" /> Open
                </a>
              )}
            </div>
          </div>

          {/* Ratings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">Yelp ★</label>
              <input type="number" step="0.1" min="1" max="5" value={yelpRating}
                onChange={(e) => setYelpRating(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Reviews</label>
              <input type="number" min="0" value={reviewCount}
                onChange={(e) => setReviewCount(Number(e.target.value))}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Anything notable…"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-5 pt-0 sticky bottom-0 bg-card">
          {!isNew && (
            <button onClick={handleDelete} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 disabled:opacity-50 transition-colors mr-auto">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
          <button onClick={onClose}
            className={`${isNew ? "flex-1" : ""} px-4 py-2 rounded-lg border border-border text-sm hover:bg-foreground/5 transition-colors`}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`${isNew ? "flex-1" : ""} px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50`}>
            {saving ? "Saving…" : isNew ? "Add Restaurant" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
