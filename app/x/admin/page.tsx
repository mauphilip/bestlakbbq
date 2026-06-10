"use client";

import { useState, useEffect } from "react";
import { Lock, Trash2, Download, ShieldCheck, AlertTriangle, CheckCircle, Plus } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { KBBQ_PRICE_RANGES } from "@/lib/types";
import AdminSearchPanel from "@/components/AdminSearchPanel";
import RestaurantForm from "@/components/RestaurantForm";
import DiscoverPanel from "@/components/DiscoverPanel";
import ManageSyncTools from "@/components/ManageSyncTools";
import { isYelpConnected } from "@/lib/yelp-shared";

function getStoredToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_token") ?? "";
}

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Restaurant | null>(null);
  const [addNew, setAddNew] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "manage" | "neighborhoods">("manage");
  const [manageTab, setManageTab] = useState<"list" | "sync">("list");
  const [searchFilter, setSearchFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState(false); // show only "needs price check"
  const [zipOverrides, setZipOverrides] = useState<Record<string, string>>({});
  const [newZip, setNewZip] = useState("");
  const [newNeighborhood, setNewNeighborhood] = useState("");
  const [savingZip, setSavingZip] = useState(false);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      loadRestaurants();
      fetch("/api/neighborhoods").then((r) => r.json()).then((d) => setZipOverrides(d.overrides ?? {})).catch(() => {});
    }
  }, []);

  async function login() {
    setLoggingIn(true);
    setLoginError("");
    const res = await fetch("/api/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setLoggingIn(false);
    if (res.ok) {
      const { token: t } = await res.json();
      sessionStorage.setItem("admin_token", t);
      setToken(t);
      loadRestaurants();
    } else {
      setLoginError("Wrong PIN. Try again.");
    }
  }

  async function loadRestaurants() {
    setLoading(true);
    try {
      const res = await fetch("/api/restaurants");
      const data = await res.json();
      setRestaurants(Array.isArray(data) ? data : []);
    } catch {
      setRestaurants([]);
    }
    setLoading(false);
  }

  async function deleteRestaurant(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the list?`)) return;
    await fetch(`/api/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(restaurants, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "restaurants.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveZipOverride(zip: string, neighborhood: string) {
    const updated = { ...zipOverrides, [zip]: neighborhood };
    await fetch("/api/neighborhoods", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ overrides: updated }),
    });
    setZipOverrides(updated);
  }

  async function deleteZipOverride(zip: string) {
    const updated = { ...zipOverrides };
    delete updated[zip];
    await fetch("/api/neighborhoods", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ overrides: updated }),
    });
    setZipOverrides(updated);
  }

  const unverifiedCount = restaurants.filter((r) => !r.price_verified).length;

  const filtered = restaurants.filter((r) => {
    if (priceFilter && r.price_verified) return false;
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q);
  });

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">Admin Access</h1>
              <p className="text-xs text-muted-foreground">Enter your PIN to continue</p>
            </div>
          </div>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="PIN" maxLength={8}
            className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-1 focus:ring-primary mb-3" />
          {loginError && <p className="text-xs text-red-400 text-center mb-3">{loginError}</p>}
          <button onClick={login} disabled={loggingIn || !pin}
            className="w-full py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loggingIn ? "Checking…" : "Enter"}
          </button>
        </div>
      </main>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="text-xs text-muted-foreground">
              {restaurants.length} restaurants
              {unverifiedCount > 0 && (
                <span className="text-yellow-500 ml-1">· {unverifiedCount} unverified prices</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportJson}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-foreground/5 transition-colors">
            <Download className="w-4 h-4" /> Export JSON
          </button>
          <button onClick={() => { sessionStorage.removeItem("admin_token"); setToken(""); }}
            className="text-sm px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
            Log out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {([
          { key: "manage", label: "Manage" },
          { key: "search", label: "Search & Add" },
          { key: "neighborhoods", label: "Neighborhoods" },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Manage tab ── */}
      {activeTab === "manage" && (
        <div className="space-y-4">
          {/* Manage subtabs */}
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
            {([
              { key: "list", label: "Restaurants" },
              { key: "sync", label: "Yelp Sync" },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setManageTab(key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  manageTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Yelp Sync subtab ── */}
          {manageTab === "sync" && (
            <ManageSyncTools
              token={token}
              onUpdated={loadRestaurants}
              onEditRestaurant={(id) => {
                const r = restaurants.find((x) => x.id === id);
                if (r) setEditTarget(r);
              }}
            />
          )}

          {/* ── Restaurants subtab ── */}
          {manageTab === "list" && (<>
          {/* Toolbar */}
          <div className="flex gap-2 items-center flex-wrap">
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by name or neighborhood…"
              className="flex-1 min-w-[180px] bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={() => setPriceFilter((v) => !v)}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors shrink-0 ${
                priceFilter ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-600 dark:text-yellow-400" : "border-border text-muted-foreground hover:text-foreground"
              }`} title="Show only restaurants whose price hasn't been manually verified">
              <AlertTriangle className="w-4 h-4" /> Needs price check{unverifiedCount > 0 ? ` (${unverifiedCount})` : ""}
            </button>
            <button onClick={() => setAddNew(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shrink-0">
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const cost = r.ayce
                  ? r.ayce_tiers.length && r.ayce_tiers[0].price > 0
                    ? `$${Math.min(...r.ayce_tiers.map((t) => t.price))}${r.ayce_tiers.length > 1 ? "–$" + Math.max(...r.ayce_tiers.map((t) => t.price)) : ""} AYCE`
                    : r.price_tier
                      ? `${r.price_tier} AYCE (${KBBQ_PRICE_RANGES[r.price_tier]?.label ?? "est."})`
                      : "AYCE (est.)"
                  : r.non_ayce_est_per_person
                    ? `~$${r.non_ayce_est_per_person}/pp`
                    : r.price_tier
                      ? `${r.price_tier} (${KBBQ_PRICE_RANGES[r.price_tier]?.label ?? "est."})`
                      : "—";

                return (
                  <div key={r.id}
                    onClick={() => setEditTarget(r)}
                    className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/40 hover:bg-foreground/[0.02] cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{r.name}</span>
                        {isYelpConnected(r) ? (
                          <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded border border-green-500/20 shrink-0">Yelp ✓</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 bg-secondary text-muted-foreground rounded border border-border shrink-0">Not linked</span>
                        )}
                        {!r.price_verified ? (
                          <span title="Price hasn't been manually confirmed — it's estimated from the Yelp price tier or seeded data"
                            className="flex items-center gap-0.5 text-xs text-yellow-500 shrink-0">
                            <AlertTriangle className="w-3 h-3" /> price est.
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-xs text-green-500 shrink-0">
                            <CheckCircle className="w-3 h-3" /> verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.neighborhood} · {cost} · ★ {r.yelp_rating}
                        {r.last_yelp_sync && (
                          <span className="ml-1 opacity-50">
                            · synced {new Date(r.last_yelp_sync).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => deleteRestaurant(r.id, r.name)}
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove from the list">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No restaurants match this filter.</p>
              )}
            </div>
          )}
          </>)}
        </div>
      )}

      {/* ── Search & Add tab ── */}
      {activeTab === "search" && (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Search by name</h2>
            <AdminSearchPanel
              token={token}
              onAdded={(r) => {
                setRestaurants((prev) => [...prev.filter((x) => x.id !== r.id), r]);
                setActiveTab("manage");
              }}
            />
          </section>

          <div className="border-t border-border" />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Discover KBBQ spots nearby</h2>
            <DiscoverPanel
              token={token}
              onImported={(imported) => {
                setRestaurants((prev) => {
                  const ids = new Set(imported.map((r) => r.id));
                  return [...prev.filter((x) => !ids.has(x.id)), ...imported];
                });
              }}
            />
          </section>
        </div>
      )}

      {/* ── Neighborhoods tab ── */}
      {activeTab === "neighborhoods" && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            These overrides are merged on top of the built-in zip→neighborhood map used by Yelp Discover. Changes take effect on the next Yelp Discover refresh.
          </p>

          {/* Current overrides */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">Current Overrides</h3>
              <span className="text-xs text-muted-foreground">{Object.keys(zipOverrides).length} entries</span>
            </div>
            {Object.keys(zipOverrides).length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No overrides set.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Zip</th>
                    <th className="text-left px-4 py-2">Neighborhood</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {Object.entries(zipOverrides).sort(([a], [b]) => a.localeCompare(b)).map(([zip, hood]) => (
                    <tr key={zip} className="hover:bg-foreground/[0.02]">
                      <td className="px-4 py-2 font-mono text-xs">{zip}</td>
                      <td className="px-4 py-2">{hood}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteZipOverride(zip)}
                          className="text-xs px-2 py-1 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1 ml-auto">
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Add row */}
            <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap">
              <input
                value={newZip}
                onChange={(e) => setNewZip(e.target.value)}
                placeholder="Zip code (e.g. 90010)"
                maxLength={10}
                className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm font-mono w-44 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                value={newNeighborhood}
                onChange={(e) => setNewNeighborhood(e.target.value)}
                placeholder="Neighborhood label"
                className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-36 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                disabled={savingZip || !newZip.trim() || !newNeighborhood.trim()}
                onClick={async () => {
                  setSavingZip(true);
                  await saveZipOverride(newZip.trim(), newNeighborhood.trim());
                  setNewZip("");
                  setNewNeighborhood("");
                  setSavingZip(false);
                }}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
                <Plus className="w-4 h-4" />{savingZip ? "Saving…" : "Add"}
              </button>
            </div>
          </div>

          {/* Built-in map reference */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Built-in Zip Map (read-only reference)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Overrides above take priority over these entries.</p>
            </div>
            <div className="overflow-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-4 py-2">Zip</th>
                    <th className="text-left px-4 py-2">Neighborhood</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {[
                    ["90004","Koreatown"],["90005","Koreatown"],["90006","Koreatown"],
                    ["90010","Koreatown"],["90019","Koreatown"],["90020","Koreatown"],
                    ["90036","Mid-Wilshire"],
                    ["90247","Gardena"],["90248","Gardena"],["90249","Gardena"],
                    ["90501","Torrance"],["90502","Torrance"],["90503","Torrance"],
                    ["90504","Torrance"],["90505","Torrance"],["90506","Torrance"],
                    ["91401","Van Nuys"],["91402","Van Nuys"],["91405","Van Nuys"],
                    ["91406","Van Nuys"],["91411","Van Nuys"],["91423","Van Nuys"],
                    ["91201","Glendale"],["91202","Glendale"],["91203","Glendale"],
                    ["91204","Glendale"],["91205","Glendale"],["91206","Glendale"],
                    ["91748","Rowland Heights"],["91789","Rowland Heights"],
                    ["91801","Alhambra"],["91803","Alhambra"],
                    ["91754","SGV"],["91755","SGV"],["91770","SGV"],
                    ["92612","Irvine"],["92614","Irvine"],["92617","Irvine"],
                    ["92618","Irvine"],["92620","Irvine"],["92604","Irvine"],
                    ["90620","Buena Park"],["90621","Buena Park"],
                    ["92801","Anaheim"],["92802","Anaheim"],["92804","Anaheim"],
                    ["90701","Cerritos"],["90703","Cerritos"],
                    ["92833","Fullerton"],["92835","Fullerton"],
                    ["92868","Orange County"],["92865","Orange County"],
                  ].map(([zip, hood]) => (
                    <tr key={zip} className="hover:bg-foreground/[0.02]">
                      <td className="px-4 py-1.5 font-mono text-muted-foreground">{zip}</td>
                      <td className="px-4 py-1.5 text-muted-foreground/80">{hood}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add new form (blank) */}
      {addNew && (
        <RestaurantForm
          token={token}
          onClose={() => setAddNew(false)}
          onSaved={(r) => {
            setRestaurants((prev) => [...prev.filter((x) => x.id !== r.id), r]);
            setAddNew(false);
          }}
        />
      )}

      {/* Edit form */}
      {editTarget && (
        <RestaurantForm
          initial={editTarget}
          token={token}
          onClose={() => setEditTarget(null)}
          onSaved={(r) => {
            setRestaurants((prev) => prev.map((x) => x.id === r.id ? r : x));
            setEditTarget(null);
          }}
          onDeleted={(id) => {
            setRestaurants((prev) => prev.filter((x) => x.id !== id));
            setEditTarget(null);
          }}
        />
      )}
    </main>
  );
}
