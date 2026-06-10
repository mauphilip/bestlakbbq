"use client";

import { useState, useEffect } from "react";
import { Lock, Trash2, Download, ShieldCheck, AlertTriangle, CheckCircle, Plus, Save, X, Pencil } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { KBBQ_PRICE_RANGES } from "@/lib/types";
import AdminSearchPanel from "@/components/AdminSearchPanel";
import RestaurantForm from "@/components/RestaurantForm";
import DiscoverPanel from "@/components/DiscoverPanel";
import ManageSyncTools from "@/components/ManageSyncTools";
import YelpConnector from "@/components/YelpConnector";
import { isYelpConnected } from "@/lib/yelp-shared";

function getStoredToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_token") ?? "";
}

const inputCls = "bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

function AddZipInline({ onAdd }: { onAdd: (zip: string) => void }) {
  const [zip, setZip] = useState("");
  const valid = /^\d{5}$/.test(zip.trim());
  return (
    <span className="flex items-center gap-1">
      <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="+ zip" maxLength={5}
        onKeyDown={(e) => { if (e.key === "Enter" && valid) { onAdd(zip.trim()); setZip(""); } }}
        className="bg-secondary border border-border rounded-md px-2 py-0.5 text-[11px] font-mono w-16 focus:outline-none focus:ring-1 focus:ring-primary" />
      <button disabled={!valid} onClick={() => { onAdd(zip.trim()); setZip(""); }} title="Add zip"
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"><Plus className="w-3.5 h-3.5" /></button>
    </span>
  );
}

function NeighborhoodCard({
  name, zips, onSetZip, onRemoveZip, onRename, onDelete,
}: {
  name: string; zips: string[];
  onSetZip: (zip: string, hood: string) => void;
  onRemoveZip: (zip: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        {editing ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { onRename(name, draft.trim()); setEditing(false); } }}
              className={`${inputCls} py-1 flex-1 min-w-0`} />
            <button onClick={() => { onRename(name, draft.trim()); setEditing(false); }} title="Save" className="text-green-500"><CheckCircle className="w-4 h-4" /></button>
            <button onClick={() => { setDraft(name); setEditing(false); }} title="Cancel" className="text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-sm font-semibold truncate">{name}</h3>
              <span className="text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5 shrink-0">{zips.length}</span>
              <button onClick={() => { setDraft(name); setEditing(true); }} title="Rename"
                className="text-muted-foreground hover:text-foreground shrink-0"><Pencil className="w-3 h-3" /></button>
            </div>
            <button onClick={() => onDelete(name)} title="Delete neighborhood"
              className="text-muted-foreground hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        {zips.map((z) => (
          <span key={z} className="flex items-center gap-0.5 text-[11px] font-mono bg-secondary border border-border rounded-md pl-1.5 pr-0.5 py-0.5">
            {z}
            <button onClick={() => onRemoveZip(z)} className="text-muted-foreground hover:text-red-400" title="Remove"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <AddZipInline onAdd={(z) => onSetZip(z, name)} />
      </div>
    </div>
  );
}

function AddNeighborhoodRow({ onAdd }: { onAdd: (zip: string, hood: string) => void }) {
  const [zip, setZip] = useState("");
  const [hood, setHood] = useState("");
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-2 flex-wrap">
      <input value={hood} onChange={(e) => setHood(e.target.value)} placeholder="New neighborhood name"
        className={`${inputCls} flex-1 min-w-40`} />
      <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="First zip" maxLength={5}
        className={`${inputCls} font-mono w-28`} />
      <button
        disabled={!/^\d{5}$/.test(zip.trim()) || !hood.trim()}
        onClick={() => { onAdd(zip.trim(), hood.trim()); setZip(""); setHood(""); }}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
        <Plus className="w-4 h-4" /> Add neighborhood
      </button>
    </div>
  );
}

function AddZipFlatRow({ names, onAdd }: { names: string[]; onAdd: (zip: string, hood: string) => void }) {
  const [zip, setZip] = useState("");
  const [hood, setHood] = useState("");
  return (
    <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap">
      <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Zip" maxLength={5}
        className={`${inputCls} font-mono w-28`} />
      <input value={hood} onChange={(e) => setHood(e.target.value)} placeholder="Neighborhood" list="nh-names"
        className={`${inputCls} flex-1 min-w-36`} />
      <datalist id="nh-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <button
        disabled={!/^\d{5}$/.test(zip.trim()) || !hood.trim()}
        onClick={() => { onAdd(zip.trim(), hood.trim()); setZip(""); setHood(""); }}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
        <Plus className="w-4 h-4" /> Add zip
      </button>
    </div>
  );
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
  const [manageTab, setManageTab] = useState<"list" | "sync" | "connector">("list");
  const [searchFilter, setSearchFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState(false); // show only "needs price check"
  const [zipMap, setZipMap] = useState<Record<string, string>>({});
  const [zipMapDirty, setZipMapDirty] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [nhView, setNhView] = useState<"grouped" | "flat">("grouped");
  const [nhSort, setNhSort] = useState<"asc" | "desc">("asc");
  const [selectedZips, setSelectedZips] = useState<Set<string>>(new Set());
  const [bulkNeighborhood, setBulkNeighborhood] = useState("");

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      loadRestaurants();
      fetch("/api/neighborhoods").then((r) => r.json()).then((d) => setZipMap(d.map ?? {})).catch(() => {});
    }
  }, []);

  // ── Neighborhood zip-map editing (local until saved) ──
  function setZip(zip: string, neighborhood: string) {
    setZipMap((m) => ({ ...m, [zip]: neighborhood }));
    setZipMapDirty(true);
  }
  function removeZip(zip: string) {
    setZipMap((m) => {
      const next = { ...m };
      delete next[zip];
      return next;
    });
    setSelectedZips((s) => {
      if (!s.has(zip)) return s;
      const next = new Set(s);
      next.delete(zip);
      return next;
    });
    setZipMapDirty(true);
  }
  function renameNeighborhood(from: string, to: string) {
    if (!to.trim() || from === to) return;
    setZipMap((m) => {
      const next: Record<string, string> = {};
      for (const [z, h] of Object.entries(m)) next[z] = h === from ? to : h;
      return next;
    });
    setZipMapDirty(true);
  }
  function deleteNeighborhood(name: string) {
    setZipMap((m) => {
      const next: Record<string, string> = {};
      for (const [z, h] of Object.entries(m)) if (h !== name) next[z] = h;
      return next;
    });
    setZipMapDirty(true);
  }
  function bulkAssign(neighborhood: string) {
    if (!neighborhood.trim()) return;
    setZipMap((m) => {
      const next = { ...m };
      for (const z of selectedZips) next[z] = neighborhood;
      return next;
    });
    setSelectedZips(new Set());
    setZipMapDirty(true);
  }
  function bulkDelete() {
    setZipMap((m) => {
      const next = { ...m };
      for (const z of selectedZips) delete next[z];
      return next;
    });
    setSelectedZips(new Set());
    setZipMapDirty(true);
  }
  async function saveZipMap() {
    setSavingMap(true);
    try {
      const res = await fetch("/api/neighborhoods", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ map: zipMap }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.map) setZipMap(d.map);
        setZipMapDirty(false);
      }
    } finally {
      setSavingMap(false);
    }
  }

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

  const unverifiedCount = restaurants.filter((r) => !r.price_verified).length;

  const filtered = restaurants.filter((r) => {
    if (priceFilter && r.price_verified) return false;
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q);
  });

  // Neighborhood map derived data
  const sortedZips = Object.keys(zipMap).sort((a, b) =>
    nhSort === "desc" ? b.localeCompare(a) : a.localeCompare(b)
  );
  const neighborhoodNames = Array.from(new Set(Object.values(zipMap))).sort((a, b) => a.localeCompare(b));
  const groups: Record<string, string[]> = {};
  for (const z of sortedZips) {
    const h = zipMap[z];
    (groups[h] ??= []).push(z);
  }
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

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
              { key: "connector", label: "Yelp Connector" },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setManageTab(key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  manageTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Yelp Connector subtab ── */}
          {manageTab === "connector" && <YelpConnector token={token} />}

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
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Changes take effect on the next Yelp Discover refresh.
              {zipMapDirty && <span className="text-yellow-500 ml-1">· unsaved changes</span>}
            </p>
            <button onClick={saveZipMap} disabled={!zipMapDirty || savingMap}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
              <Save className="w-4 h-4" />
              {savingMap ? "Saving…" : zipMapDirty ? "Save changes" : "Saved"}
            </button>
          </div>

          {/* View toggle */}
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
            {([
              { key: "grouped", label: "Grouped" },
              { key: "flat", label: "Flat list" },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setNhView(key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  nhView === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {sortedZips.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 bg-card border border-border rounded-xl">
              The map is empty. Add a neighborhood below to get started.
            </p>
          )}

          {/* ── Grouped view ── */}
          {nhView === "grouped" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 items-start">
                {groupNames.map((name) => (
                  <NeighborhoodCard
                    key={name}
                    name={name}
                    zips={groups[name]}
                    onSetZip={setZip}
                    onRemoveZip={removeZip}
                    onRename={renameNeighborhood}
                    onDelete={deleteNeighborhood}
                  />
                ))}
              </div>
              <AddNeighborhoodRow onAdd={(zip, hood) => setZip(zip, hood)} />
            </div>
          )}

          {/* ── Flat view ── */}
          {nhView === "flat" && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border text-xs">
                <span className="text-muted-foreground">{sortedZips.length} zips · sort</span>
                {([["asc", "Zip ↑"], ["desc", "Zip ↓"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setNhSort(k)}
                    className={`px-2 py-0.5 rounded-md border transition-colors ${nhSort === k ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {selectedZips.size > 0 && (
                <div className="sticky top-0 z-10 bg-secondary border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{selectedZips.size} selected</span>
                  <input value={bulkNeighborhood} onChange={(e) => setBulkNeighborhood(e.target.value)}
                    placeholder="Neighborhood" list="nh-names" className={`${inputCls} flex-1 min-w-36`} />
                  <button disabled={!bulkNeighborhood.trim()}
                    onClick={() => { bulkAssign(bulkNeighborhood.trim()); setBulkNeighborhood(""); }}
                    className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                    Assign
                  </button>
                  <button onClick={bulkDelete}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3 h-3" /> Delete selected
                  </button>
                </div>
              )}
              <datalist id="nh-names">{neighborhoodNames.map((n) => <option key={n} value={n} />)}</datalist>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2 w-8">
                      <input type="checkbox"
                        checked={sortedZips.length > 0 && selectedZips.size === sortedZips.length}
                        onChange={(e) => setSelectedZips(e.target.checked ? new Set(sortedZips) : new Set())} />
                    </th>
                    <th className="text-left px-4 py-2">Zip</th>
                    <th className="text-left px-4 py-2">Neighborhood</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sortedZips.map((zip) => (
                    <tr key={zip} className="hover:bg-foreground/[0.02]">
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selectedZips.has(zip)}
                          onChange={(e) => setSelectedZips((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(zip); else next.delete(zip);
                            return next;
                          })} />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{zip}</td>
                      <td className="px-4 py-2">
                        <input value={zipMap[zip]} onChange={(e) => setZip(zip, e.target.value)}
                          list="nh-names" className={`${inputCls} w-full`} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => removeZip(zip)}
                          className="text-xs px-2 py-1 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1 ml-auto">
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AddZipFlatRow names={neighborhoodNames} onAdd={(zip, hood) => setZip(zip, hood)} />
            </div>
          )}
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
