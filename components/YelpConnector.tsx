"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle, AlertTriangle, Wifi } from "lucide-react";

interface Status {
  ok: boolean;
  rateLimited?: boolean;
  error?: string;
  dailyLimit?: string | null;
  remaining?: string | null;
  resetTime?: string | null;
  retryAfter?: string | null;
  updated?: number;
}

function fmtReset(resetTime?: string | null): string | null {
  if (!resetTime) return null;
  // Yelp sends an ISO timestamp; tolerate a unix-seconds value too.
  let d = new Date(resetTime);
  if (isNaN(d.getTime())) {
    const n = parseInt(resetTime, 10);
    if (!isNaN(n)) d = new Date(n * 1000);
  }
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export default function YelpConnector({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/yelp-status", { headers: { Authorization: `Bearer ${token}` } });
      setStatus(await res.json());
    } catch (e) {
      setStatus({ ok: false, error: String(e) });
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const remaining = status?.remaining ? parseInt(status.remaining, 10) : null;
  const limit = status?.dailyLimit ? parseInt(status.dailyLimit, 10) : null;
  const pct = remaining !== null && limit ? Math.max(0, Math.round((remaining / limit) * 100)) : null;
  const barColor = pct === null ? "var(--border)" : pct > 50 ? "#22c55e" : pct > 20 ? "#eab308" : "#ef4444";
  const reset = fmtReset(status?.resetTime);

  const connected = status?.ok;
  const rateLimited = status?.rateLimited;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Wifi className="w-4 h-4" /> Yelp API connection</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Live connection and remaining daily quota. Sync/Discover both draw from this.</p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm font-medium rounded-lg hover:bg-foreground/5 disabled:opacity-50 transition-colors shrink-0">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 text-sm">
          {loading && !status ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : rateLimited ? (
            <span className="flex items-center gap-1.5 text-red-500 font-medium"><AlertTriangle className="w-4 h-4" /> Rate limited{status?.retryAfter ? ` — retry in ${status.retryAfter}s` : ""}</span>
          ) : connected ? (
            <span className="flex items-center gap-1.5 text-green-500 font-medium"><CheckCircle className="w-4 h-4" /> Connected</span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-500 font-medium"><AlertTriangle className="w-4 h-4" /> {status?.error ?? "Not connected"}</span>
          )}
        </div>

        {/* Quota bar */}
        {remaining !== null && limit ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{remaining.toLocaleString()} / {limit.toLocaleString()} calls remaining today</span>
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{reset ? `Resets ${reset}` : ""}</span>
              {status?.updated && <span>checked {new Date(status.updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            {pct !== null && pct <= 20 && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 pt-1">Low quota — a full Sync uses ~1 call per restaurant. Consider waiting until it resets.</p>
            )}
          </div>
        ) : (
          !loading && <p className="text-xs text-muted-foreground">Quota figures weren&apos;t returned (Yelp omits them on some errors). Status above still reflects the connection.</p>
        )}
      </div>
    </div>
  );
}
