"use client";

import { useState, useEffect } from "react";
import { Lock, Trash2, Pencil, Download, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle, Plus } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { KBBQ_PRICE_RANGES } from "@/lib/types";
import AdminSearchPanel from "@/components/AdminSearchPanel";
import RestaurantForm from "@/components/RestaurantForm";

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
  const [activeTab, setActiveTab] = useState<"search" | "manage">("manage");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ updated: number; notFound: number } | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) { setToken(stored); loadRestaurants(); }
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
    const res = await fetch("/api/restaurants");
    const data = await res.json();
    setRestaurants(data);
    setLoading(false);
  }

  async function deleteRestaurant(id: string, name: string) {
    if (!confirm(`Delete "${name}" from KV?`)) return;
    await fetch(`/api/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
  }

  async function refreshFromYelp() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/restaurants/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setRefreshResult({ updated: data.updated, notFound: data.notFound });
      await loadRestaurants(); // reload with fresh data
    } catch {
      setRefreshResult({ updated: 0, notFound: -1 });
    }
    setRefreshing(false);
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

  const unverifiedCount = restaurants.filter((r) => !r.price_verified).length;

  const filtered = restaurants.filter((r) =>
    !searchFilter || r.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.neighborhood.toLowerCase().includes(searchFilter.toLowerCase())
  );

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
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
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
          <button onClick={refreshFromYelp} disabled={refreshing}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-foreground/5 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Syncing Yelp…" : "Sync from Yelp"}
          </button>
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

      {/* Refresh result banner */}
      {refreshResult && (
        <div className={`rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2 ${
          refreshResult.notFound === -1
            ? "bg-red-500/10 border border-red-500/20 text-red-400"
            : "bg-green-500/10 border border-green-500/20 text-green-400"
        }`}>
          {refreshResult.notFound === -1 ? (
            <><AlertTriangle className="w-4 h-4" /> Yelp sync failed — check YELP_API_KEY env var</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Synced {refreshResult.updated} restaurants from Yelp · {refreshResult.notFound} not found</>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {(["manage", "search"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab === "search" ? "Search & Add" : "Manage Restaurants"}
          </button>
        ))}
      </div>

      {/* ── Manage tab ── */}
      {activeTab === "manage" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex gap-2 items-center">
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by name or neighborhood…"
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
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
                const isKv = r.kv_managed;
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
                    className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-border/80 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{r.name}</span>
                        {isKv && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20 shrink-0">KV</span>
                        )}
                        {!r.price_verified && (
                          <span className="flex items-center gap-0.5 text-xs text-yellow-500 shrink-0">
                            <AlertTriangle className="w-3 h-3" /> unverified
                          </span>
                        )}
                        {r.price_verified && (
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
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => setEditTarget(r)}
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {isKv && (
                        <button onClick={() => deleteRestaurant(r.id, r.name)}
                          className="flex items-center gap-1 text-xs px-2 py-1 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Search & Add tab ── */}
      {activeTab === "search" && (
        <AdminSearchPanel
          token={token}
          onAdded={(r) => {
            setRestaurants((prev) => [...prev.filter((x) => x.id !== r.id), r]);
            setActiveTab("manage");
          }}
        />
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
        />
      )}
    </main>
  );
}
