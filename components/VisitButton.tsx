"use client";

import { useState } from "react";
import { CheckCircle2, PlusCircle } from "lucide-react";
import type { Restaurant, Visit } from "@/lib/types";
import VisitModal from "./VisitModal";

interface Props {
  restaurant: Restaurant;
  initialVisit?: Visit;
}

export default function VisitButton({ restaurant, initialVisit }: Props) {
  const [visit, setVisit] = useState<Visit | undefined>(initialVisit);
  const [open, setOpen] = useState(false);

  const hasVisit = visit?.visited;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          hasVisit
            ? "bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
        }`}
        title={hasVisit ? "Edit your visit" : "Log a visit"}
      >
        {hasVisit ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <PlusCircle className="w-3.5 h-3.5" />
        )}
        {hasVisit ? "Visited" : "Log visit"}
      </button>

      {open && (
        <VisitModal
          restaurant={restaurant}
          existing={visit}
          onClose={() => setOpen(false)}
          onSaved={(v) => setVisit(v)}
        />
      )}
    </>
  );
}
