"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle, ExternalLink, Clock, ShieldAlert, ArrowRight, Trash2 } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import type { RestaurantDiff } from "@/lib/yelp-types";

interface Props {
  token: string;
  onUpdated?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
function DiffValue({ cur, next, suffix = "", fmt }: {
  cur: string | number | null; next: string | number | null; suffix?: string; fmt?: (v: string | number) => string;
}) {
  const f = (v: string | number | null) => (v === null ? "—" : fmt ? fmt(v) : String(v));
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

const nameOf = (d: RestaurantDiff) =>
  d.name || d.yelp_id || d.yelp_url?.match(/yelp\.com\/biz\/([^?#/]+)/)?.[1] || "Unknown restaurant";

// One pass over Yelp: surfaces data updates to apply, Yelp-confirmed closures to
// remove, and broken links to fix. Deletes are review-only (never auto-selected),
// and only Yelp-confirmed-closed rows are deletable here.
export default function ManageSyncTools({ token, onUpdated }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [diffs, setDiffs] = useState<RestaurantDiff[] | null>(null);
  const [syncError, setSyncError] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set()); // data-update rows selected for Apply
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Restore cached results
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kbbq_sync_cache");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.results) {
          setDiffs(c.results);
          setLastSynced(c.timestamp ?? null);
          if (c.deletedIds) setDeletedIds(new Set<string>(c.deletedIds));
          if (c.appliedIds) setAppliedIds(new Set<string>(c.appliedIds));
        }
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line

  function persist(patch: Record<string, unknown>) {
    try {
      const raw = sessionStorage.getItem("kbbq_sync_cache");
      const c = raw ? JSON.parse(raw) : {};
      sessionStorage.setItem("kbbq_sync_cache", JSON.stringify({ ...c, ...patch }));
    } catch { /* ignore */ }
  }

  // ── Categorize (one pass) ──────────────────────────────────────────────────
  const live = (diffs ?? []).filter((d) => !deletedIds.has(d.id));
  const unreachable = live.filter((d) => !!d.error);                                   // no Yelp ID / no data → fix the link
  const closed = live.filter((d) => !d.error && d.yelp?.is_closed);                    // Yelp-confirmed closed → deletable
  const changed = live.filter((d) => !d.error && !d.yelp?.is_closed && d.changes.length > 0);
  const upToDate = live.filter((d) => !d.error && !d.yelp?.is_closed && d.changes.length === 0);

  const selectableChanged = changed.filter((d) => !appliedIds.has(d.id));
  const selectedNotApplied = selectableChanged.filter((d) => selected.has(d.id)).length;

  async function runSync() {
    setSyncing(true);
    setSyncError("");
    setDiffs(null);
    setSelected(new Set());
    setAppliedIds(new Set());
    setDeletedIds(new Set());
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
      const timestamp = new Date().toISOString();
      setDiffs(results);
      setLastSynced(timestamp);
      try { sessionStorage.setItem("kbbq_sync_cache", JSON.stringify({ results, timestamp })); } catch { /* ignore */ }
      // pre-select rows with data changes (safe — applying updates never deletes)
      setSelected(new Set(results.filter((d) => !d.error && !d.yelp?.is_closed && d.changes.length > 0).map((d) => d.id)));
    } catch (e) { setSyncError(String(e)); }
    setSyncing(false);
  }

  async function applySelected() {
    const toApply = selectableChanged.filter((d) => selected.has(d.id));
    if (!toApply.length) return;
    setApplying(true);
    setApplyProgress({ done: 0, total: toApply.length });

    let restaurants: Restaurant[] = [];
    try { const r = await fetch("/api/restaurants"); const d = await r.json(); restaurants = Array.isArray(d) ? d : []; } catch { /* ignore */ }

    let done = 0;
    for (const diff of toApply) {
      const current = restaurants.find((r) => r.id === diff.id);
      if (current) {
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
          setAppliedIds((s) => { const n = new Set(s).add(diff.id); persist({ appliedIds: [...n] }); return n; });
        } catch { /* ignore */ }
      }
      done++;
      setApplyProgress({ done, total: toApply.length });
    }
    setApplying(false);
    onUpdated?.();
  }

  async function deleteClosed(id: string, name: string) {
    if (!confirm(`Delete "${name}"? It's marked closed on Yelp — this removes it from the list.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/restaurants/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDeletedIds((s) => { const n = new Set(s).add(id); persist({ deletedIds: [...n] }); return n; });
    } catch { /* ignore */ }
    setDeletingId(null);
    onUpdated?.();
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Sync from Yelp</h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Checks every linked restaurant against Yelp in one pass: review counts / price / URL updates to apply,
            spots that are <span className="text-red-500">closed</span> on Yelp, and any with a broken link to fix.
            <span className="italic"> API ratings may differ slightly from the website.</span>
          </p>
          {lastSynced && (
            <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" /> Last synced {new Date(lastSynced).toLocaleString()} · cached
            </p>
          )}
        </div>
        <button onClick={runSync} disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0 transition-colors">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : diffs ? "Re-sync" : "Sync from Yelp"}
        </button>
      </div>

      {syncError && <ErrorBox msg={syncError} />}
      {syncing && <LoadingSpinner label="Fetching each restaurant from Yelp (~1/sec)… takes 1–3 min" />}

      {diffs && !syncing && (
        <>
          {/* Stats */}
          <div className="flex flex-wrap gap-2 text-xs">
            {changed.length > 0 && <span className="px-2.5 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg border border-yellow-500/20 font-medium">{changed.length} have updates</span>}
            {closed.length > 0 && <span className="px-2.5 py-1 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 font-medium">{closed.length} closed on Yelp</span>}
            {unreachable.length > 0 && <span className="px-2.5 py-1 bg-secondary text-muted-foreground rounded-lg border border-border">{unreachable.length} need a link fix</span>}
            {upToDate.length > 0 && <span className="px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg border border-green-500/20">{upToDate.length} up to date</span>}
          </div>

          {/* ── Closed on Yelp (per-row delete, never auto-selected) ── */}
          {closed.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-red-500">Closed on Yelp — review &amp; remove</p>
              {closed.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-red-400">{nameOf(d)}</span>
                    {d.neighborhood && <span className="text-xs text-muted-foreground ml-2">{d.neighborhood}</span>}
                  </div>
                  {d.yelp_url && (
                    <a href={d.yelp_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                      Yelp <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button onClick={() => deleteClosed(d.id, nameOf(d))} disabled={deletingId === d.id}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors shrink-0">
                    <Trash2 className="w-3 h-3" /> {deletingId === d.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Broken links (not deletable — could be a live spot with a stale URL) ── */}
          {unreachable.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1.5">
              <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> {unreachable.length} couldn&apos;t be checked — fix the Yelp link
              </p>
              <p className="text-xs text-muted-foreground">
                Their Yelp link is broken or missing, so we can&apos;t tell if they&apos;re open. They are <em>not</em> offered for deletion (a broken link might just be a live spot with a stale URL). Open each in the <span className="font-medium">Restaurants</span> tab → <span className="font-medium">Find on Yelp</span> to relink (or delete it there if it really is gone).
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                {unreachable.map((d) => (
                  <span key={d.id} className="text-xs text-muted-foreground">
                    {nameOf(d)}
                    {d.yelp_url && <a href={d.yelp_url} target="_blank" rel="noopener noreferrer" className="text-primary ml-1">↗</a>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Data updates (bulk apply) ── */}
          {changed.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-xs pt-1">
                <span className="font-medium">{changed.length} have updates</span>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => setSelected(new Set(selectableChanged.map((d) => d.id)))} className="text-primary hover:underline">Select all</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground">None</button>
                <span className="text-muted-foreground">· {selectedNotApplied} selected</span>
              </div>

              <div className="space-y-2">
                {changed.map((diff) => {
                  const isApplied = appliedIds.has(diff.id);
                  const isSel = selected.has(diff.id);
                  const ratingChange = diff.changes.find((c) => c.field === "yelp_rating");
                  const reviewChange = diff.changes.find((c) => c.field === "review_count");
                  const tierChange = diff.changes.find((c) => c.field === "price_tier");
                  const urlChange = diff.changes.find((c) => c.field === "yelp_url");
                  return (
                    <div key={diff.id} className={`rounded-xl border px-4 py-3 transition-colors ${
                      isApplied ? "border-green-500/20 bg-green-500/5 opacity-70" : isSel ? "border-primary/30 bg-primary/5" : "border-yellow-500/20 bg-yellow-500/5"
                    }`}>
                      <div className="flex items-center gap-3">
                        {!isApplied ? (
                          <div onClick={() => setSelected((s) => { const n = new Set(s); isSel ? n.delete(diff.id) : n.add(diff.id); return n; })}
                            className={`w-4 h-4 rounded border shrink-0 cursor-pointer flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                            {isSel && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                          </div>
                        ) : <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-semibold truncate">{nameOf(diff)}</span>
                          {diff.neighborhood && <span className="text-xs text-muted-foreground shrink-0">{diff.neighborhood}</span>}
                          {isApplied && <span className="text-xs text-green-500 shrink-0">Applied</span>}
                        </div>
                        {diff.yelp_url && (
                          <a href={diff.yelp_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                            Yelp <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <ul className="mt-2 ml-7 space-y-1">
                        {ratingChange && <li className="flex items-center gap-2 text-sm"><span className="text-muted-foreground w-20 shrink-0">Rating</span><DiffValue cur={ratingChange.old as number} next={ratingChange.new as number} /></li>}
                        {reviewChange && <li className="flex items-center gap-2 text-sm"><span className="text-muted-foreground w-20 shrink-0">Reviews</span><DiffValue cur={reviewChange.old as number} next={reviewChange.new as number} fmt={(v) => Number(v).toLocaleString()} /></li>}
                        {tierChange && <li className="flex items-center gap-2 text-sm"><span className="text-muted-foreground w-20 shrink-0">Price tier</span><DiffValue cur={tierChange.old as string} next={tierChange.new as string} /></li>}
                        {urlChange && <li className="flex items-center gap-2 text-sm"><span className="text-muted-foreground w-20 shrink-0">Yelp URL</span><span className="text-xs text-muted-foreground truncate max-w-xs">{urlChange.new as string}</span></li>}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border pt-3 flex items-center justify-between gap-4 flex-wrap">
                {applyProgress ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-40">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(applyProgress.done / applyProgress.total) * 100}%` }} />
                    </div>
                    {applyProgress.done}/{applyProgress.total} updated
                  </div>
                ) : <div className="flex-1" />}
                <button onClick={applySelected} disabled={applying || selectedNotApplied === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 shrink-0">
                  <CheckCircle className="w-4 h-4" />
                  {applying ? `Applying… ${applyProgress?.done ?? 0}/${applyProgress?.total ?? 0}` : `Apply ${selectedNotApplied} update${selectedNotApplied !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}

          {changed.length === 0 && closed.length === 0 && unreachable.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-green-500"><CheckCircle className="w-4 h-4" /> Everything is linked, open, and up to date.</p>
          )}
        </>
      )}
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
