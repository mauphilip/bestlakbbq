import BeatCalculator from "@/components/BeatCalculator";
import calculatorData from "@/data/calculator_items.json";
import type { CalculatorItem } from "@/lib/types";

export default function CalculatorPage() {
  const items = calculatorData as CalculatorItem[];
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Beat the Restaurant</h1>
        <p className="text-muted-foreground">
          Track how much meat you ate and compare it to what the same cuts would cost at Costco or H-Mart. Did your AYCE session pay off?
        </p>
      </div>
      <BeatCalculator items={items} />
    </div>
  );
}
