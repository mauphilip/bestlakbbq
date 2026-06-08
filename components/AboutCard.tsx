import type { Restaurant } from "@/lib/types";
import { ExternalLink } from "lucide-react";

export default function AboutCard({ restaurants }: { restaurants: Restaurant[] }) {
  const lastUpdated = restaurants
    .map((r) => r.last_price_check)
    .sort()
    .reverse()[0];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Left — How to read it */}
        <div className="p-6">
          <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
            <span className="text-lg">📊</span> How to read this chart
          </h2>
          <ul className="space-y-3 text-sm">
            {[
              { icon: "→", label: "X-axis", desc: "Cost per person — AYCE uses lowest tier price; Non-AYCE is an estimated per-person spend for a typical group." },
              { icon: "↑", label: "Y-axis", desc: "Popularity — the average of Yelp and Google star ratings." },
              { icon: "⬤", label: "Bubble size", desc: "Total review count. Bigger bubble = more reviews = stronger signal." },
              { icon: "🟠", label: "Orange circles", desc: "All-you-can-eat (AYCE) restaurants." },
              { icon: "🔵", label: "Blue triangles", desc: "Non-AYCE restaurants (à la carte pricing)." },
              { icon: "╌", label: "Dashed lines", desc: "Average cost and average rating. Top-left quadrant = best value." },
            ].map(({ icon, label, desc }) => (
              <li key={label} className="flex gap-3">
                <span className="shrink-0 w-5 text-center text-muted-foreground">{icon}</span>
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{label}: </span>
                  {desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right — Data sources */}
        <div className="p-6">
          <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
            <span className="text-lg">🗃️</span> About the data
          </h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Data seeded from the{" "}
              <a
                href="https://www.reddit.com/r/LosAngeles/comments/sklect/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:text-primary transition-colors"
              >
                viral 2022 chart
              </a>{" "}
              by Rajesh Nitityanandan, expanded with additional spots and updated prices.
            </p>
            <p>
              Prices are verified manually. Ratings are pulled from Yelp and Google at the time of each price check. Non-AYCE per-person costs are estimates based on a typical 2–3 person order divided by party size.
            </p>
            <p>
              Currently tracking <span className="font-semibold text-foreground">{restaurants.length} restaurants</span> across LA County.
            </p>
            <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-muted-foreground/70">
                Last price check: <span className="text-muted-foreground">{lastUpdated}</span>
              </span>
              <a
                href="https://github.com/mauphilip/bestlakbbq/issues/new?title=Restaurant+suggestion"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Suggest a restaurant
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
