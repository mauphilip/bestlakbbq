"use client";

import { Star, RotateCcw, ExternalLink } from "lucide-react";
import type { Restaurant, Visit } from "@/lib/types";

interface Props {
  restaurant: Restaurant;
  visit: Visit;
  /** Omit to render read-only (visitor isn't logged in as the owner). */
  onEdit?: () => void;
}

export default function VisitCard({ restaurant, visit, onEdit }: Props) {
  const cost = restaurant.ayce
    ? `$${Math.min(...restaurant.ayce_tiers.map((t) => t.price))}`
    : restaurant.non_ayce_est_per_person
    ? `~$${restaurant.non_ayce_est_per_person}`
    : "—";

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{restaurant.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {restaurant.neighborhood} · {restaurant.ayce ? "AYCE" : "Non-AYCE"} · {cost}/pp
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {restaurant.yelp_url && (
            <a
              href={restaurant.yelp_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Stars */}
      {visit.personalRating ? (
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`w-4 h-4 ${
                n <= visit.personalRating! ? "fill-primary text-primary" : "text-border"
              }`}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No rating</p>
      )}

      {/* Would go back */}
      <div className="flex items-center gap-2">
        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span
          className={`text-xs font-medium ${
            visit.wouldGoBack ? "text-green-500" : "text-red-400"
          }`}
        >
          {visit.wouldGoBack ? "Would go back" : "Probably not again"}
        </span>
      </div>

      {/* Notes */}
      {visit.notes && (
        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2 mt-1">
          {visit.notes}
        </p>
      )}

      {/* Date */}
      {visit.visitDate && (
        <p className="text-xs text-muted-foreground/60 mt-auto">
          Visited {new Date(visit.visitDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}
    </div>
  );
}
