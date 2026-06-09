import RestaurantList from "@/components/RestaurantList";
import { getAllRestaurants } from "@/lib/getRestaurants";
import type { Restaurant } from "@/lib/types";

export default async function ListPage() {
  const restaurants: Restaurant[] = await getAllRestaurants();
  return (
    <div className="min-h-screen pt-24 pb-16 px-6 max-w-6xl mx-auto">
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 bg-white/4 text-muted-foreground text-xs font-medium mb-4 tracking-wide uppercase">
          {restaurants.length} Restaurants
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Directory</h1>
        <p className="text-muted-foreground">
          Sort by cost, rating, or value score. Value = rating ÷ cost × 100.
        </p>
      </div>
      <RestaurantList restaurants={restaurants} />
    </div>
  );
}
