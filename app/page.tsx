import KBBQChartWrapper from "@/components/KBBQChartWrapper";
import restaurantsData from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

export default function Home() {
  const restaurants = restaurantsData as Restaurant[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          LA Korean BBQ — Cost vs. Popularity
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          An updated take on the{" "}
          <a
            href="https://public.tableau.com/app/profile/messidude/viz/LosAngelesCounty-KoreanBBQComparison/Dashboard1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            viral 2022 chart
          </a>
          . Each bubble is a restaurant — size = review count, orange circles = AYCE,
          blue triangles = non-AYCE. Hover for details.
        </p>
      </div>

      <KBBQChartWrapper restaurants={restaurants} />

      <p className="text-xs text-muted-foreground mt-6 text-center">
        Prices updated manually. Non-AYCE costs are estimates based on typical group orders.{" "}
        <a href="/list" className="text-primary hover:underline">
          View as list →
        </a>
      </p>
    </div>
  );
}
