import type { Restaurant } from "@/lib/types";
import { ExternalLink } from "lucide-react";

const HOW_TO_READ = [
  { icon: "→", label: "X-axis (horizontal)", desc: "Yelp rating — higher is better." },
  { icon: "↑", label: "Y-axis (vertical)", desc: "Cost per person — AYCE uses the entry-level tier price; Non-AYCE is an estimated spend for a typical group order." },
  { icon: "⬤", label: "Bubble size", desc: "Review count from Yelp. Bigger = more reviews = stronger signal." },
  { icon: "●", label: "Circles", desc: "All-you-can-eat (AYCE) restaurants." },
  { icon: "▲", label: "Triangles", desc: "Non-AYCE restaurants (set menu or à la carte)." },
  { icon: "—", label: "Reference lines", desc: "Average cost and average rating. Bottom-right quadrant = best value." },
];

const COLOR_TIERS = [
  { color: "#f59e0b", label: "Under $35", sublabel: "budget" },
  { color: "#f97316", label: "$35–44", sublabel: "mid-range" },
  { color: "#ef4444", label: "$45–59", sublabel: "premium" },
  { color: "#991b1b", label: "$60+", sublabel: "high-end" },
];

function FaqItem({ summary, icon, children, defaultOpen = false }: {
  summary: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group bg-card border border-border rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none hover:bg-foreground/[0.03] transition-colors">
        <span className="font-medium text-sm flex items-center gap-2">
          <span className="text-base">{icon}</span> {summary}
        </span>
        <span className="text-muted-foreground shrink-0 text-lg leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-border/60">{children}</div>
    </details>
  );
}

export default function AboutCard({ restaurants }: { restaurants: Restaurant[] }) {
  const lastUpdated = restaurants
    .map((r) => r.last_price_check)
    .sort()
    .reverse()[0];

  return (
    <div className="space-y-3">
      {/* How to read this chart */}
      <FaqItem summary="How to read this chart" icon="📊" defaultOpen>
        <ul className="space-y-3 text-sm">
          {HOW_TO_READ.map(({ icon, label, desc }) => (
            <li key={label} className="flex gap-3">
              <span className="shrink-0 w-5 text-center text-muted-foreground">{icon}</span>
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{label}: </span>
                {desc}
              </span>
            </li>
          ))}
          {/* Color gradient */}
          <li className="flex gap-3">
            <span className="shrink-0 w-5 text-center text-muted-foreground">🎨</span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Dot color: </span>cost per person
              <ul className="mt-1.5 space-y-1">
                {COLOR_TIERS.map(({ color, label, sublabel }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-muted-foreground/70">— {sublabel}</span>
                  </li>
                ))}
              </ul>
            </span>
          </li>
        </ul>
      </FaqItem>

      {/* About the data */}
      <FaqItem summary="About the data" icon="🗃️">
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
            Ratings are from Yelp. AYCE prices use the entry-level tier. Non-AYCE costs are estimated from the most common set or a typical 2–3 person order — treat them as ballpark figures until manually verified.
          </p>
          <p>
            <span className="font-medium text-foreground">AYCE vs Non-AYCE</span> isn&apos;t something Yelp reports, so it&apos;s set by hand — newly added spots may need their type confirmed.
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
      </FaqItem>
    </div>
  );
}
