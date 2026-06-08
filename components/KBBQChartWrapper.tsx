"use client";

import dynamic from "next/dynamic";
import type { Restaurant } from "@/lib/types";

const KBBQChart = dynamic(() => import("./KBBQChart"), { ssr: false });

export default function KBBQChartWrapper({ restaurants }: { restaurants: Restaurant[] }) {
  return <KBBQChart restaurants={restaurants} />;
}
