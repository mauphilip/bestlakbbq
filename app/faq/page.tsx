import type { Metadata } from "next";
import { KBBQ_PRICE_RANGES, type PriceTier } from "@/lib/types";

export const metadata: Metadata = {
  title: "FAQ — SoCal KBBQ Chart",
  description: "Frequently asked questions about the SoCal KBBQ chart: how costs, ratings, bubble sizes, and shapes are calculated.",
};

const TIER_NOTE: Record<PriceTier, string> = {
  "$": "budget",
  "$$": "mid-range",
  "$$$": "premium",
  "$$$$": "high-end",
};

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: "How is the cost per person calculated?",
    a: (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">AYCE spots:</strong> The chart plots the <em>average</em> of the menu tiers — sum the tier prices and divide by the number of tiers (e.g. Standard&nbsp;$27, Premium&nbsp;$35, Prime&nbsp;$43, Wagyu&nbsp;$50 → ≈ $39). Hover a bubble to see the full price range and every tier.
        </p>
        <p>
          <strong className="text-foreground">Non-AYCE spots:</strong> An estimated cost per person — the most expensive combo or sharing platter divided by its recommended group size (e.g. a $120 combo for 3 = $40/pp). An estimate; it may vary.
        </p>
        <p>
          Where an exact price hasn&apos;t been verified yet, we fall back to the Yelp price tier&apos;s midpoint (see the next question).
        </p>
      </div>
    ),
  },
  {
    q: "What do the $ / $$ / $$$ / $$$$ price tiers mean?",
    a: (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          When a restaurant&apos;s exact price isn&apos;t verified yet, we estimate it from Yelp&apos;s price tier, mapped to KBBQ-appropriate per-person ranges:
        </p>
        <ul className="space-y-1 list-none">
          {(Object.keys(KBBQ_PRICE_RANGES) as PriceTier[]).map((t) => (
            <li key={t}>
              <span className="text-foreground font-medium">{t}</span> — {KBBQ_PRICE_RANGES[t].label}/pp{" "}
              <span className="text-muted-foreground/70">({TIER_NOTE[t]})</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground/80">
          These ranges are calibrated estimates and get refined over time as more exact prices are verified.
        </p>
      </div>
    ),
  },
  {
    q: "How do ratings work?",
    a: (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          Ratings are pulled from the Yelp Fusion API. They may differ slightly from what's displayed on Yelp's website due to API caching.
        </p>
        <p>
          Currently only Yelp ratings are shown. Google ratings are planned for a future update.
        </p>
      </div>
    ),
  },
  {
    q: "What does the bubble size mean?",
    a: (
      <p className="text-sm text-muted-foreground">
        Bubble area represents the square root of the review count — so larger bubbles mean more reviews, but not linearly. A restaurant with 4× the reviews is only 2× the bubble size. This prevents extremely popular places from visually overwhelming the chart.
      </p>
    ),
  },
  {
    q: "What does the shape mean?",
    a: (
      <ul className="text-sm text-muted-foreground space-y-1 list-none">
        <li><span className="text-foreground font-medium">Circle</span> = AYCE (All You Can Eat)</li>
        <li><span className="text-foreground font-medium">Triangle</span> = Non-AYCE (à la carte, sharing platters, etc.)</li>
      </ul>
    ),
  },
  {
    q: "What does the color mean?",
    a: (
      <ul className="text-sm text-muted-foreground space-y-1 list-none">
        <li><span className="font-medium" style={{ color: "#f59e0b" }}>Gold</span> = under $35/pp (budget)</li>
        <li><span className="font-medium" style={{ color: "#f97316" }}>Orange</span> = $35–$44/pp (mid-range)</li>
        <li><span className="font-medium" style={{ color: "#ef4444" }}>Coral/Red</span> = $45–$59/pp (premium)</li>
        <li><span className="font-medium" style={{ color: "#991b1b" }}>Dark Red/Maroon</span> = $60+/pp (high-end)</li>
      </ul>
    ),
  },
  {
    q: "What does \"Value Pick\" mean?",
    a: (
      <p className="text-sm text-muted-foreground">
        Restaurants in the top 25% of the value score (rating ÷ cost × 100) <em>and</em> under $40/pp earn a "Value Pick" badge. It's a quick signal for spots where you get a lot of quality for the price.
      </p>
    ),
  },
  {
    q: "How often is the data updated?",
    a: (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          Prices are checked manually and may be months behind. The "last price check" date on each record indicates when it was last verified.
        </p>
        <p>
          Yelp ratings and review counts can be synced from the Yelp API via the admin panel when new data is available.
        </p>
      </div>
    ),
  },
  {
    q: "About this project",
    a: (
      <p className="text-sm text-muted-foreground">
        Inspired by the viral 2022 Tableau visualization by Rajesh Nitityanandan. This is an updated, living version with more restaurants and an actively maintained dataset covering the greater LA and Orange County area.
      </p>
    ),
  },
];

export default function FaqPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 pt-24">
      <h1 className="text-3xl font-bold mb-2">FAQ</h1>
      <p className="text-muted-foreground mb-8">Answers to common questions about the SoCal KBBQ chart.</p>

      <div className="space-y-3">
        {faqs.map(({ q, a }) => (
          <details
            key={q}
            className="group bg-card border border-border rounded-xl overflow-hidden"
          >
            <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none hover:bg-foreground/[0.03] transition-colors">
              <span className="font-medium text-sm">{q}</span>
              <span className="text-muted-foreground shrink-0 text-lg leading-none transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="px-5 pb-4 pt-1 border-t border-border/60">
              {a}
            </div>
          </details>
        ))}
      </div>
    </main>
  );
}
