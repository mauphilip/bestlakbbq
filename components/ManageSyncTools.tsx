"use client";

import { useState, useEffect } from "react";
import {
  RefreshCw, CheckCircle, ExternalLink,
  Clock, ShieldAlert, ArrowRight,
} from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { RestaurantDiff } from "@/lib/yelp-types";

interface Props {
  token: string;
  onUpdated?: () => void;
}

interface LinkResult {
  id: string;
  name: string;
  neighborhood: string;
  yelp_url: string;
  candidates: {
    yelp_id: string; name: string; url: string; rating: number;
    review_count: number; address: string; categories: string[];
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
function DiffValue({
  cur, next, suffix = "", fmt,
}: {
  cur: string | number | null;
  next: string | number | null;
  suffix?: string;
  fmt?: (v: string | number) => string;
}) {
  const f = (v: string | number | null) =>
    v === null ? "—" : fmt ? fmt(v) : String(v);

  const changed = next !== null && cur !== next;
  if (!changed) return <span className="text-muted-foreground">{f(cur)}{suffix}</span>;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <span className="line-through text-muted-foreground/50 text-xs">{f(cur)}{suffix}</span>
      <ArrowRight className="w-3 h-3 text-primary shrink-0" />
      <span className="font-semibold text-primary">{f(next)}{suffix}</span>
    </span>
  );
}

export default function ManageSyncTools({ token, onUpdated }: Props) {
  // ── Re-link from Yelp ──────────────────────────────────────────────────────────
  const [relinking, setRelinking] = useState(false);
  const [relinkError, setRelinkError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [relinkResult, setRelinkResult] = useState<any | null>(null);
  const [relinkDryRun, setRelinkDryRun] = useState(true);

  // ── Closure check ────────────────────────────────────────────────────────────
  const [closureRunning, setClosureRunning] = useState(false);
  const [closureResults, setClosureResults] = useState<RestaurantDiff[] | null>(null);
  const [closureError, setClosureError] = useState("");
  const [closureSelected, setClosureSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [closureLastChecked, setClosureLastChecked] = useState<string | null>(null);

  // ── Data sync ────────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [diffs, setDiffs] = useState<RestaurantDiff[] | null>(null);
  const [selectedSync, setSelectedSync] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState("");
  const [syncStats, setSyncStats] = useState<{ changedCount: number; upToDateCount: number; errorCount: number } | null>(null);
  const [syncLastChecked, setSyncLastChecked] = useState<string | null>(null);

  // ── Yelp link ────────────────────────────────────────────────────────────────
  const [linkScanning, setLinkScanning] = useState(false);
  const [linkResults, setLinkResults] = useState<LinkResult[] | null>(null);
  const [linkError, setLinkError] = useState("");
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [savedLinks, setSavedLinks] = useState<Set<string>>(new Set());

  // Restore cached sync/closure results
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kbbq_closure_cache");
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.results) {
          setClosureResults(cached.results);
          setClosureLastChecked(cached.timestamp ?? null);
        }
      }
    } catch { /* ignore */ }
    try {
      const raw = sessionStorage.getItem("kbbq_sync_cache");
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.results) {
          setDiffs(cached.results);
          setSyncStats(cached.stats ?? null);
          setSyncLastChecked(cached.timestamp ?? null);
          const autoSel = new Set<string>(
            (cached.results as RestaurantDiff[]).filter((d: RestaurantDiff) => d.changes.length > 0).map((d: RestaurantDiff) => d.id)
          );
          setSelectedSync(autoSel);
        }
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line

  const diffsWithChanges = diffs?.filter((d) => d.changes.length > 0) ?? [];

  // ── Closure check action ──────────────────────────────────────────────────────
  async function runRelink(dryRun: boolean) {
    setRelinking(true);
    setRelinkError("");
    setRelinkDryRun(dryRun);
    if (dryRun) setRelinkResult(null);
    try {
      const res = await fetch("/api/restaurants/relink", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRelinkResult(data);
      if (!dryRun) onUpdated?.();
    } catch (e) { setRelinkError(String(e)); }
    setRelinking(false);
  }

  async function runClosureCheck() {
    setClosureRunning(true);
    setClosureError("");
    setClosureResults(null);
    setClosureSelected(new Set());
    setDeletedIds(new Set());
    try {
      const res = await fetch("/api/restaurants/yelp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "closed" }),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      const results: RestaurantDiff[] = data.results ?? [];
      const timestamp = new Date().toISOString();
      setClosureResults(results);
      setClosureLastChecked(timestamp);
      try { sessionStorage.setItem("kbbq_closure_cache", JSON.stringify({ results, timestamp })); } catch { /* ignore */ }
      // Pre-select all genuinely-closed restaurants (all are now deletable via soft-delete).
      setClosureSelected(new Set(results.filter((r) => r.now_closed).map((r) => r.id)));
    } catch (e) { setClosureError(String(e)); }
    setClosureRunning(false);
  }

  async function deleteClosureSelected() {
    const toDelete = [...closureSelected].filter((id) => !deletedIds.has(id));
    if (!toDelete.length) return;
    setDeleting(true);
    for (const id of toDelete) {
      // DELETE soft-deletes base-JSON restaurants (KV tombstone) and hard-deletes KV-only ones.
      try {
        await fetch(`/api/restaurants/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setDeletedIds((s) => new Set(s).add(id));
      } catch { /* ignore */ }
    }
    setDeleting(false);
    onUpdated?.();
  }

  // ── Data sync action ──────────────────────────────────────────────────────────
  async function runSync() {
    setSyncing(true);
    setSyncError("");
    setDiffs(null);
    setSelectedSync(new Set());
    setAppliedIds(new Set());
    setApplyProgress(null);
    try {
      const res = await fetch("/api/restaurants/yelp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "updates" }),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(text || `HTTP ${res.status}`); }
      if (!res.ok || data.error) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      const results: RestaurantDiff[] = data.results ?? [];
      const stats = { changedCount: data.changedCount, upToDateCount: data.upToDateCount, errorCount: data.errorCount };
      const timestamp = new Date().toISOString();
      setDiffs(results);
      setSyncStats(stats);
      setSyncLastChecked(timestamp);
      try { sessionStorage.setItem("kbbq_sync_cache", JSON.stringify({ results, stats, timestamp })); } catch { /* ignore */ }
      const autoSel = new Set<string>(results.filter((d) => d.changes.length > 0).map((d) => d.id));
      setSelectedSync(autoSel);
    } catch (e) { setSyncError(String(e)); }
    setSyncing(false);
  }

  async function applySelected() {
    const toApply = diffsWithChanges.filter((d) => selectedSync.has(d.id) && !appliedIds.has(d.id));
    if (!toApply.length) return;
    setApplying(true);
    setApplyProgress({ done: 0, total: toApply.length });

    let restaurants: Restaurant[] = [];
    try {
      const res = await fetch("/api/restaurants");
      const data = await res.json();
      restaurants = Array.isArray(data) ? data : [];
    } catch { /* ignore */ }

    let done = 0;
    for (const diff of toApply) {
      const current = restaurants.find((r) => r.id === diff.id);
      if (!current) { done++; setApplyProgress({ done, total: toApply.length }); continue; }

      const updated = { ...current };
      for (const c of diff.changes) {
        if (c.field === "yelp_rating") updated.yelp_rating = c.new as number;
        if (c.field === "review_count") updated.review_count = c.new as number;
        if (c.field === "price_tier") updated.price_tier = c.new as Restaurant["price_tier"];
        if (c.field === "yelp_url") updated.yelp_url = c.new as string;
      }
      updated.last_yelp_sync = new Date().toISOString();
      if (diff.yelp_id) updated.yelp_id = diff.yelp_id;

      try {
        await fetch("/api/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(updated),
        });
        setAppliedIds((s) => new Set(s).add(diff.id));
      } catch { /* ignore */ }
      done++;
      setApplyProgress({ done, total: toApply.length });
    }

    setApplying(false);
    onUpdated?.();
  }

  // ── Yelp link actions ─────────────────────────────────────────────────────
  async function runLinkScan() {
    setLinkScanning(true);
    setLinkError("");
    setLinkResults(null);
    try {
      const res = await fetch("/api/restaurants/yelp-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "scan" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLinkResults(data.results ?? []);
    } catch (e) { setLinkError(String(e)); }
    setLinkScanning(false);
  }

  async function saveLink(restaurantId: string, yelp_id: string, yelp_url: string) {
    setSavingLink(restaurantId);
    try {
      const res = await fetch("/api/restaurants/yelp-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: restaurantId, yelp_id, yelp_url }),
      });
      if (res.ok) {
        setSavedLinks((s) => new Set(s).add(restaurantId));
        onUpdated?.();
      }
    } catch { /* ignore */ }
    setSavingLink(null);
  }

  const syncAllChangedCount = diffsWithChanges.filter((d) => !appliedIds.has(d.id)).length;
  const selectedNotApplied = [...selectedSync].filter((id) => !appliedIds.has(id)).length;

  return (
    <div className="space-y-6">

      {/* ── Section 0: Re-link from Yelp ─────────────────────────────── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Re-link from Yelp</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Searches Yelp by name for every restaurant and fixes stale/guessed Yelp links (the cause of broken
              restaurant links and reviews not updating). Run a preview first, then apply.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => runRelink(true)} disabled={relinking}
              className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm font-medium rounded-lg hover:bg-foreground/5 disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${relinking && relinkDryRun ? "animate-spin" : ""}`} />
              {relinking && relinkDryRun ? "Scanning…" : "Preview"}
            </button>
            {relinkResult?.dryRun && relinkResult?.summary?.confident > 0 && (
              <button onClick={() => runRelink(false)} disabled={relinking}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                <CheckCircle className="w-4 h-4" />
                {relinking && !relinkDryRun ? "Applying…" : `Apply ${relinkResult.summary.confident}`}
              </button>
            )}
          </div>
        </div>

        {relinkError && <ErrorBox msg={relinkError} />}
        {relinking && <LoadingSpinner label="Searching Yelp for each restaurant… ~15–30s" />}

        {relinkResult && !relinking && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                {relinkResult.summary.confident} confident {relinkResult.dryRun ? "to fix" : "fixed"}
              </span>
              {relinkResult.summary.weak > 0 && (
                <span className="px-2.5 py-1 rounded-lg border border-yellow-500/20 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  {relinkResult.summary.weak} low-confidence (skipped)
                </span>
              )}
              {relinkResult.summary.same > 0 && (
                <span className="px-2.5 py-1 rounded-lg border border-border bg-secondary text-muted-foreground">
                  {relinkResult.summary.same} already correct
                </span>
              )}
              {relinkResult.summary.noMatch > 0 && (
                <span className="px-2.5 py-1 rounded-lg border border-border bg-secondary text-muted-foreground">
                  {relinkResult.summary.noMatch} no match
                </span>
              )}
            </div>
            {relinkResult.dryRun && (
              <p className="text-xs text-muted-foreground">
                Preview only — nothing changed. Click <span className="font-medium">Apply</span> to write the confident fixes.
              </p>
            )}
            {!relinkResult.dryRun && (
              <div className="flex items-center gap-2 text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Re-linked {relinkResult.summary.applied} restaurants. Re-run the closure/sync checks to see corrected data.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 1: Closure check ─────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Check for Closed Restaurants</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Checks every tracked restaurant against Yelp and lists any that are permanently closed.
            </p>
            {closureLastChecked && (
              <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                Last checked {new Date(closureLastChecked).toLocaleString()}
              </p>
            )}
          </div>
          <button onClick={runClosureCheck} disabled={closureRunning}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-medium rounded-lg hover:bg-red-500/20 disabled:opacity-50 shrink-0 transition-colors">
            <RefreshCw className={`w-4 h-4 ${closureRunning ? "animate-spin" : ""}`} />
            {closureRunning ? "Checking…" : closureResults ? "Re-check" : "Check Closures"}
          </button>
        </div>

        {closureError && <ErrorBox msg={closureError} />}
        {closureRunning && <LoadingSpinner label="Checking each restaurant on Yelp… takes 1–2 min" />}

        {closureResults && !closureRunning && (() => {
            const live = closureResults.filter((d) => !deletedIds.has(d.id));
            const closed = live.filter((d) => d.now_closed);
            const unreachable = live.filter((d) => !d.now_closed); // 404 / no Yelp data — usually a stale link
            const selectableIds = closed.map((d) => d.id);
            const allSelected = selectableIds.length > 0 && selectableIds.every((id) => closureSelected.has(id));

            if (closed.length === 0 && unreachable.length === 0) {
              return (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="w-4 h-4" /> All restaurants are still open on Yelp.
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {closed.length > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs font-medium text-red-500">{closed.length} permanently closed</p>
                      <div className="flex items-center gap-2 text-xs">
                        <button onClick={() => setClosureSelected(allSelected ? new Set() : new Set(selectableIds))}
                          className="text-primary hover:underline">{allSelected ? "Deselect all" : `Select all ${selectableIds.length}`}</button>
                        <span className="text-muted-foreground">· {closureSelected.size} selected</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {closed.map((diff) => {
                        const displayName = diff.name || diff.yelp_id || diff.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] || "Unknown restaurant";
                        const isSel = closureSelected.has(diff.id);
                        return (
                          <div key={diff.id} className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                            <div onClick={() => setClosureSelected((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                              className={`w-4 h-4 rounded border shrink-0 cursor-pointer flex items-center justify-center ${isSel ? "bg-red-500 border-red-500" : "border-border"}`}>
                              {isSel && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium line-through text-red-400">{displayName}</span>
                              {diff.neighborhood && <span className="text-xs text-muted-foreground ml-2">{diff.neighborhood}</span>}
                            </div>
                            {diff.yelp_url && (
                              <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                                Yelp <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {unreachable.length > 0 && (
                  <div className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {unreachable.length} couldn&apos;t be verified on Yelp — usually a stale/incorrect Yelp link, not a closure.
                      Run <span className="font-medium">Re-link from Yelp</span> (below), then re-check.
                    </span>
                  </div>
                )}

                {closureSelected.size > 0 && (
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                      <p className="text-xs text-muted-foreground">{closureSelected.size} selected for deletion</p>
                      <button onClick={() => deleteClosureSelected()} disabled={deleting}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                        <ShieldAlert className="w-4 h-4" />
                        {deleting ? "Deleting…" : `Delete ${closureSelected.size} restaurant${closureSelected.size !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
      </div>

      {/* ── Section 2: Data sync ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Sync Live Data from Yelp</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Updates review counts, price tiers, and Yelp URLs.{" "}
              <span className="italic">Note: API ratings may differ slightly from website display.</span>
            </p>
            {syncLastChecked && (
              <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                Last synced {new Date(syncLastChecked).toLocaleString()}
              </p>
            )}
          </div>
          <button onClick={runSync} disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0 transition-colors">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : diffs ? "Re-sync" : "Sync Data"}
          </button>
        </div>

        {syncError && <ErrorBox msg={syncError} />}
        {syncing && <LoadingSpinner label="Fetching each restaurant from Yelp (~1/sec)… takes 1–3 min" />}

        {diffs && !syncing && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {syncStats?.changedCount ? (
                <span className="px-2.5 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20 font-medium">
                  {syncStats.changedCount} have updates
                </span>
              ) : null}
              {syncStats?.upToDateCount ? (
                <span className="px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg border border-green-500/20">
                  {syncStats.upToDateCount} up to date
                </span>
              ) : null}
              {syncStats?.errorCount ? (
                <span className="px-2.5 py-1 bg-secondary text-muted-foreground rounded-lg border border-border">
                  {syncStats.errorCount} no Yelp ID
                </span>
              ) : null}
            </div>

            {diffsWithChanges.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => setSelectedSync(new Set(diffsWithChanges.filter((d) => !appliedIds.has(d.id)).map((d) => d.id)))}
                  className="text-primary hover:underline">Select all {syncAllChangedCount}</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => setSelectedSync(new Set())} className="text-muted-foreground hover:text-foreground">None</button>
                <span className="text-muted-foreground">· {selectedNotApplied} selected</span>
              </div>
            )}

            {diffsWithChanges.length > 0 ? (
              <div className="space-y-2">
                {diffsWithChanges.map((diff) => {
                  const isApplied = appliedIds.has(diff.id);
                  const isSel = selectedSync.has(diff.id);
                  const ratingChange = diff.changes.find((c) => c.field === "yelp_rating");
                  const reviewChange = diff.changes.find((c) => c.field === "review_count");
                  const tierChange = diff.changes.find((c) => c.field === "price_tier");
                  const urlChange = diff.changes.find((c) => c.field === "yelp_url");
                  const displayName = diff.name || diff.yelp_id || diff.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] || "Unknown restaurant";

                  return (
                    <div key={diff.id}
                      className={`rounded-xl border px-4 py-3 transition-colors ${
                        isApplied ? "border-green-500/20 bg-green-500/5 opacity-70" :
                        isSel ? "border-primary/30 bg-primary/5" :
                        "border-yellow-500/20 bg-yellow-500/5"
                      }`}>
                      <div className="flex items-center gap-3">
                        {!isApplied ? (
                          <div onClick={() => setSelectedSync((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                            className={`w-4 h-4 rounded border shrink-0 cursor-pointer flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                            {isSel && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                          </div>
                        ) : <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}

                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-semibold truncate">{displayName}</span>
                          {diff.neighborhood && <span className="text-xs text-muted-foreground shrink-0">{diff.neighborhood}</span>}
                          {isApplied && <span className="text-xs text-green-500 shrink-0">Applied</span>}
                        </div>

                        {diff.yelp_url && (
                          <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                            Yelp <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <ul className="mt-2 ml-7 space-y-1">
                        {ratingChange && (
                          <li className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-20 shrink-0">Rating</span>
                            <DiffValue cur={ratingChange.old as number} next={ratingChange.new as number} />
                          </li>
                        )}
                        {reviewChange && (
                          <li className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-20 shrink-0">Reviews</span>
                            <DiffValue cur={reviewChange.old as number} next={reviewChange.new as number} fmt={(v) => Number(v).toLocaleString()} />
                          </li>
                        )}
                        {tierChange && (
                          <li className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-20 shrink-0">Price tier</span>
                            <DiffValue cur={tierChange.old as string} next={tierChange.new as string} />
                          </li>
                        )}
                        {urlChange && (
                          <li className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-20 shrink-0">Yelp URL</span>
                            <span className="text-xs text-muted-foreground truncate max-w-xs">{urlChange.new as string}</span>
                          </li>
                        )}
                        {diff.yelp?.categories?.length ? (
                          <li className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground w-20 shrink-0">Categories</span>
                            <div className="flex flex-wrap gap-1">
                              {diff.yelp.categories.map((cat) => (
                                <span key={cat} className={`text-xs px-1.5 py-0.5 rounded border ${
                                  cat === "koreanbbq"
                                    ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 font-medium"
                                    : "bg-secondary border-border text-muted-foreground"
                                }`}>{cat}</span>
                              ))}
                            </div>
                          </li>
                        ) : null}
                      </ul>

                      {diff.error && <p className="mt-1.5 ml-7 text-xs text-muted-foreground/60">{diff.error}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">✓ All data is up to date.</p>
            )}

            {diffsWithChanges.length > 0 && (
              <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border pt-3 flex items-center justify-between gap-4 flex-wrap">
                {applyProgress && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-40">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(applyProgress.done / applyProgress.total) * 100}%` }} />
                    </div>
                    {applyProgress.done}/{applyProgress.total} updated
                  </div>
                )}
                {!applyProgress && <div className="flex-1" />}
                <button onClick={applySelected} disabled={applying || selectedNotApplied === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
                  <CheckCircle className="w-4 h-4" />
                  {applying ? `Applying… ${applyProgress?.done ?? 0}/${applyProgress?.total ?? 0}` : `Apply ${selectedNotApplied} update${selectedNotApplied !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 3: Link to Yelp ──────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Link Restaurants to Yelp</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Searches Yelp by name for each restaurant without a Yelp ID. Once linked, they&apos;ll be included in future sync checks.
            </p>
          </div>
          <button onClick={runLinkScan} disabled={linkScanning}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0 transition-colors">
            <RefreshCw className={`w-4 h-4 ${linkScanning ? "animate-spin" : ""}`} />
            {linkScanning ? "Scanning…" : "Scan Unlinked (takes ~1 min)"}
          </button>
        </div>

        {linkError && <ErrorBox msg={linkError} />}
        {linkScanning && <LoadingSpinner label="Searching Yelp for each unlinked restaurant…" />}

        {linkResults && !linkScanning && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{linkResults.length} restaurant{linkResults.length !== 1 ? "s" : ""} need Yelp links</p>
            {linkResults.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle className="w-4 h-4" /> All restaurants have Yelp links.
              </div>
            ) : (
              <div className="space-y-2">
                {linkResults.map((result) => {
                  const isLinked = savedLinks.has(result.id);
                  const isSaving = savingLink === result.id;
                  return (
                    <div key={result.id} className="rounded-xl border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold">{result.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{result.neighborhood}</span>
                        </div>
                        {isLinked && (
                          <span className="flex items-center gap-1 text-xs text-green-500 font-medium shrink-0">
                            <CheckCircle className="w-3.5 h-3.5" /> Linked
                          </span>
                        )}
                      </div>
                      {result.candidates.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No Yelp matches found</p>
                      ) : (
                        <div className="space-y-1.5">
                          {result.candidates.slice(0, 3).map((c) => {
                            const nameMismatch = !c.name.toLowerCase().includes(result.name.split(" ")[0].toLowerCase());
                            return (
                              <div key={c.yelp_id} className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {nameMismatch && <span title="Name doesn't closely match" className="text-yellow-500 text-xs">⚠</span>}
                                    <span className="text-sm font-medium">{c.name}</span>
                                    <span className="text-xs text-muted-foreground">★ {c.rating}</span>
                                    <span className="text-xs text-muted-foreground">· {c.review_count} reviews</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {c.address}
                                    {c.categories.length > 0 && <span className="opacity-70"> · {c.categories.slice(0, 2).join(", ")}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                  {!isLinked && (
                                    <button onClick={() => saveLink(result.id, c.yelp_id, c.url)}
                                      disabled={isSaving}
                                      className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors">
                                      {isSaving ? "Saving…" : "Link"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
      <RefreshCw className="w-5 h-5 animate-spin text-primary" />
      {label}
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{msg}</div>;
}
