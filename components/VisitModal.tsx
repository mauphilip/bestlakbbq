"use client";

import { useState } from "react";
import { X, Star } from "lucide-react";
import type { Restaurant, Visit } from "@/lib/types";

interface Props {
  restaurant: Restaurant;
  existing?: Visit;
  onClose: () => void;
  onSaved: (visit: Visit) => void;
}

export default function VisitModal({ restaurant, existing, onClose, onSaved }: Props) {
  const [rating, setRating] = useState(existing?.personalRating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [wouldGoBack, setWouldGoBack] = useState(existing?.wouldGoBack ?? true);
  const [visitDate, setVisitDate] = useState(existing?.visitDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const visit: Visit = {
      restaurantId: restaurant.id,
      visited: true,
      visitDate,
      personalRating: rating || undefined,
      wouldGoBack,
      notes: notes.trim() || undefined,
    };
    await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visit),
    });
    setSaving(false);
    onSaved(visit);
    onClose();
  }

  async function remove() {
    await fetch(`/api/visits/${restaurant.id}`, { method: "DELETE" });
    onSaved({ restaurantId: restaurant.id, visited: false });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-semibold text-base">{restaurant.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{restaurant.neighborhood} · {restaurant.ayce ? "AYCE" : "Non-AYCE"}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Star rating */}
          <div>
            <label className="text-sm font-medium block mb-2">Your Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-7 h-7 transition-colors ${
                      n <= (hoverRating || rating)
                        ? "fill-primary text-primary"
                        : "text-border"
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <button onClick={() => setRating(0)} className="text-xs text-muted-foreground ml-2 self-center hover:text-foreground">
                  clear
                </button>
              )}
            </div>
          </div>

          {/* Would go back */}
          <div>
            <label className="text-sm font-medium block mb-2">Would you go back?</label>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setWouldGoBack(v)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    wouldGoBack === v
                      ? v ? "bg-green-500/15 border-green-500/30 text-green-500" : "bg-red-500/15 border-red-500/30 text-red-400"
                      : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}
                >
                  {v ? "Yes, definitely" : "Probably not"}
                </button>
              ))}
            </div>
          </div>

          {/* Visit date */}
          <div>
            <label className="text-sm font-medium block mb-2">Visit Date</label>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium block mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you order? How was the service? Anything to remember…"
              rows={3}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-5 pt-0">
          {existing?.visited && (
            <button
              onClick={remove}
              className="text-sm text-muted-foreground hover:text-red-400 transition-colors mr-auto"
            >
              Remove visit
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-foreground/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Visit"}
          </button>
        </div>
      </div>
    </div>
  );
}
