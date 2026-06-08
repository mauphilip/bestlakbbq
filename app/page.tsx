import KBBQChartWrapper from "@/components/KBBQChartWrapper";
import restaurantsData from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

export default function Home() {
  const restaurants = restaurantsData as Restaurant[];
  const ayceCount = restaurants.filter(r => r.ayce).length;
  const nonAyceCount = restaurants.length - ayceCount;
  const minPrice = Math.min(...restaurants.map(r =>
    r.ayce ? Math.min(...r.ayce_tiers.map(t => t.price)) : (r.non_ayce_est_per_person ?? 999)
  ));
  const maxPrice = Math.max(...restaurants.map(r =>
    r.ayce ? Math.max(...r.ayce_tiers.map(t => t.price)) : (r.non_ayce_est_per_person ?? 0)
  ));
  const neighborhoods = new Set(restaurants.map(r => r.neighborhood)).size;

  return (
    <div className="min-h-screen hero-glow">
      {/* Hero */}
      <section className="pt-32 pb-12 px-6 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium mb-6 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Los Angeles · Korean BBQ Guide
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
            Find your next<br />
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(90deg, oklch(0.78 0.21 38), oklch(0.70 0.18 55), oklch(0.78 0.21 38))",
              }}
            >
              KBBQ spot.
            </span>
          </h1>

          <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10">
            An updated take on the{" "}
            <a
              href="https://public.tableau.com/app/profile/messidude/viz/LosAngelesCounty-KoreanBBQComparison/Dashboard1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/70 hover:text-primary underline underline-offset-4 decoration-white/20 hover:decoration-primary/50 transition-colors"
            >
              viral 2022 chart
            </a>
            {" "}— every LA KBBQ restaurant ranked by cost and popularity, always up to date.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-3">
            {[
              { value: restaurants.length, label: "Restaurants" },
              { value: ayceCount, label: "AYCE spots" },
              { value: nonAyceCount, label: "Non-AYCE" },
              { value: `$${minPrice}–$${maxPrice}`, label: "Price range" },
              { value: neighborhoods, label: "Neighborhoods" },
            ].map(({ value, label }) => (
              <div key={label} className="stat-card rounded-xl px-5 py-3 text-center min-w-[80px]">
                <div className="text-xl font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chart section */}
      <section className="px-6 pb-16 max-w-6xl mx-auto">
        {/* Section label */}
        <div className="flex items-center gap-3 mb-5">
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
            Cost vs. Popularity
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="text-xs text-muted-foreground">
            Bubble size = review count
          </div>
        </div>

        {/* Chart card */}
        <div
          className="rounded-2xl border border-white/6 overflow-hidden"
          style={{
            background: "linear-gradient(145deg, oklch(0.13 0.008 260), oklch(0.10 0.005 260))",
            boxShadow: "0 0 0 1px oklch(1 0 0 / 4%), 0 24px 80px -12px oklch(0 0 0 / 0.6), inset 0 1px 0 oklch(1 0 0 / 6%)",
          }}
        >
          <div className="p-6">
            <KBBQChartWrapper restaurants={restaurants} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          🟠 circles = AYCE · 🔵 triangles = Non-AYCE (cost is estimated per person) ·{" "}
          <a href="/list" className="hover:text-foreground transition-colors underline underline-offset-2">
            View as list →
          </a>
        </p>
      </section>
    </div>
  );
}
