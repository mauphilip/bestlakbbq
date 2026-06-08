"use client";

import { useState, useEffect } from "react";
import { Lock, Trash2, Pencil, Download, ShieldCheck } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import AdminSearchPanel from "@/components/AdminSearchPanel";
import RestaurantForm from "@/components/RestaurantForm";
import restaurantsData from "@/data/restaurants.json";

function getStoredToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_token") ?? "";
}

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [kvRestaurants, setKvRestaurants] = useState<Restaurant[]>([]);
  const [editTarget, setEditTarget] = useState<Restaurant | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "manage">("search");

  // Hydrate token from sessionStorage
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      loadKvRestaurants(stored);
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
      loadKvRestaurants(t);
    } else {
      setLoginError("Wrong PIN. Try again.");
    }
  }

  async function loadKvRestaurants(t: string) {
    const res = await fetch("/api/restaurants");
    const all: Restaurant[] = await res.json();
    const baseIds = new Set((restaurantsData as Restaurant[]).map((r) => r.id));
    setKvRestaurants(all.filter((r) => !baseIds.has(r.id)));
  }

  async function deleteRestaurant(id: string) {
    if (!confirm("Delete this restaurant from KV?")) return;
    await fetch(`/api/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setKvRestaurants((prev) => prev.filter((r) => r.id !== id));
  }

  function exportJson() {
    const all = [...(restaurantsData as Restaurant[]), ...kvRestaurants];
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "restaurants.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Login screen
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

          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="PIN"
            maxLength={8}
            className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-1 focus:ring-primary mb-3"
          />

          {loginError && (
            <p className="text-xs text-red-400 text-center mb-3">{loginError}</p>
          )}

          <button
            onClick={login}
            disabled={loggingIn || !pin}
            className="w-full py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loggingIn ? "Checking…" : "Enter"}
          </button>
        </div>
      </main>
    );
  }

  // Admin dashboard
  const allRestaurants = [...(restaurantsData as Restaurant[]), ...kvRestaurants];

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="text-xs text-muted-foreground">{allRestaurants.length} restaurants total · {kvRestaurants.length} in KV</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportJson}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-foreground/5 transition-colors"
          >
            <Download className="w-4 h-4" /> Export JSON
          </button>
          <button
            onClick={() => { sessionStorage.removeItem("admin_token"); setToken(""); }}
            className="text-sm px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {(["search", "manage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "search" ? "Search & Add" : "Manage Restaurants"}
          </button>
        ))}
      </div>

      {/* Search tab */}
      {activeTab === "search" && (
        <AdminSearchPanel
          token={token}
          onAdded={(r) => setKvRestaurants((prev) => [...prev.filter((x) => x.id !== r.id), r])}
        />
      )}

      {/* Manage tab */}
      {activeTab === "manage" && (
        <div className="space-y-3">
          {allRestaurants.map((r) => {
            const isKv = kvRestaurants.some((k) => k.id === r.id);
            const cost = r.ayce
              ? `$${Math.min(...r.ayce_tiers.map((t) => t.price))}${r.ayce_tiers.length > 1 ? "–$" + Math.max(...r.ayce_tiers.map((t) => t.price)) : ""} AYCE`
              : r.non_ayce_est_per_person
              ? `~$${r.non_ayce_est_per_person}/pp`
              : "—";

            return (
              <div key={r.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.name}</span>
                    {isKv && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20">KV</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.neighborhood} · {cost} · ★ {r.yelp_rating}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setEditTarget(r)}
                    className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  {isKv && (
                    <button
                      onClick={() => deleteRestaurant(r.id)}
                      className="flex items-center gap-1 text-xs px-2 py-1 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <RestaurantForm
          initial={editTarget}
          token={token}
          onClose={() => setEditTarget(null)}
          onSaved={(r) => {
            setKvRestaurants((prev) => [...prev.filter((x) => x.id !== r.id), r]);
            setEditTarget(null);
          }}
        />
      )}
    </main>
  );
}
