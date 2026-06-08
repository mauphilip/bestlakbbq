import RestaurantList from "@/components/RestaurantList";
import restaurantsData from "@/data/restaurants.json";
import type { Restaurant } from "@/lib/types";

export default function ListPage() {
  const restaurants = restaurantsData as Restaurant[];
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Restaurant Directory</h1>
        <p className="text-muted-foreground">
          Filter and sort {restaurants.length} LA KBBQ spots. Value score = rating ÷ cost × 100.
        </p>
      </div>
      <RestaurantList restaurants={restaurants} />
    </div>
  );
}
