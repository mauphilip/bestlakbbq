import BeatCalculator from "@/components/BeatCalculator";
import calculatorData from "@/data/calculator_items.json";
import type { CalculatorItem } from "@/lib/types";

export default function CalculatorPage() {
  const items = calculatorData as CalculatorItem[];
  return (
    <div className="min-h-screen pt-24 pb-16 px-6 max-w-2xl mx-auto">
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium mb-4 tracking-wide uppercase">
          🥩 Cost Calculator
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Beat the Restaurant</h1>
        <p className="text-muted-foreground leading-relaxed">
          Track how much meat you ate and compare it to Costco or H-Mart retail prices.
          Did your AYCE session actually pay off?
        </p>
      </div>
      <BeatCalculator items={items} />
    </div>
  );
}
