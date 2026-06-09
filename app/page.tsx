import KBBQChartWrapper from "@/components/KBBQChartWrapper";
import AboutCard from "@/components/AboutCard";
import { getAllRestaurants } from "@/lib/getRestaurants";
import type { Restaurant } from "@/lib/types";

export default async function Home() {
  const restaurants: Restaurant[] = await getAllRestaurants();
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
      <section className="pt-28 pb-10 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-medium mb-5 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Los Angeles · Korean BBQ Guide
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
            Find your next<br />
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(90deg, oklch(0.68 0.21 38), oklch(0.72 0.18 55))",
              }}
            >
              KBBQ spot.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
            An updated take on the{" "}
            <a
              href="https://public.tableau.com/app/profile/messidude/viz/LosAngelesCounty-KoreanBBQComparison/Dashboard1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/70 hover:text-primary underline underline-offset-4 decoration-border hover:decoration-primary/50 transition-colors"
            >
              viral 2022 chart
            </a>
            {" "}— every LA KBBQ restaurant ranked by cost and popularity, always up to date.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-2.5">
            {[
              { value: restaurants.length, label: "Restaurants" },
              { value: ayceCount, label: "AYCE spots" },
              { value: nonAyceCount, label: "Non-AYCE" },
              { value: `$${minPrice}–$${maxPrice}`, label: "Price range" },
              { value: neighborhoods, label: "Neighborhoods" },
            ].map(({ value, label }) => (
              <div key={label} className="stat-card rounded-xl px-4 py-2.5 text-center min-w-[72px]">
                <div className="text-lg sm:text-xl font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chart section */}
      <section className="px-4 sm:px-6 pb-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Cost vs. Popularity
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="text-xs text-muted-foreground hidden sm:block">
            Bubble size = review count
          </div>
        </div>

        <div
          className="rounded-2xl border border-border overflow-hidden"
          style={{
            background: "var(--card)",
            boxShadow: "0 0 0 1px var(--border), 0 20px 60px -12px oklch(0 0 0 / 0.3)",
          }}
        >
          <div className="p-4 sm:p-6">
            <KBBQChartWrapper restaurants={restaurants} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          ● circle = AYCE · ▲ triangle = Non-AYCE · color = cost tier
        </p>
      </section>

      {/* FAQ — how to read + about the data */}
      <section className="px-4 sm:px-6 pb-16 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            How to read this chart
          </div>
          <div className="flex-1 h-px bg-border" />
          <a href="/faq" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Full FAQ →
          </a>
        </div>
        <AboutCard restaurants={restaurants} />
      </section>
    </div>
  );
}
