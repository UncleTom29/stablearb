"use client";

import { usePegHealth } from "@/lib/hooks/usePegHealth";
import { useVault }     from "@/lib/hooks/useVault";
import PegGauge         from "@/components/PegGauge";
import PriceChart,
  { type PricePoint }  from "@/components/PriceChart";
import CollateralRatioBar from "@/components/CollateralRatioBar";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { pegHealth, isLoading: pegLoading }     = usePegHealth();
  const { collateralRatio, totalSupply, isLoading: vaultLoading } = useVault();

  // Build a simple mock 24h price history for the chart
  // (In production, fetch from an API that returns historical prices)
  const [chartData, setChartData] = useState<PricePoint[]>([]);

  useEffect(() => {
    const CHART_DATA_POINTS = 48;           // 48 data points
    const INTERVAL_MS       = 30 * 60 * 1000; // 30-minute intervals → 24 h window
    const PRICE_NOISE_RANGE = 0.006;        // ±0.3 % noise around peg

    const now  = Date.now();
    const mock = Array.from({ length: CHART_DATA_POINTS }, (_, i) => {
      const t     = new Date(now - (CHART_DATA_POINTS - 1 - i) * INTERVAL_MS);
      const noise = (Math.random() - 0.5) * PRICE_NOISE_RANGE;
      return {
        time:  `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`,
        price: Math.round((1.0 + noise) * 1e6) / 1e6,
      };
    });
    setChartData(mock);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Live Dashboard</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <PegGauge pegHealth={pegHealth} isLoading={pegLoading} />
        <CollateralRatioBar ratio={collateralRatio} isLoading={vaultLoading} />
      </div>

      <PriceChart data={chartData} isLoading={false} />

      {/* Protocol stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total SUSD Supply"
          value={totalSupply ? `${Number(totalSupply).toLocaleString(undefined, { maximumFractionDigits: 2 })} SUSD` : "—"}
          isLoading={vaultLoading}
        />
        <StatCard
          label="Current SUSD Price"
          value={pegHealth ? `$${pegHealth.price.toFixed(4)}` : "—"}
          isLoading={pegLoading}
        />
        <StatCard
          label="Price Deviation"
          value={pegHealth ? `${pegHealth.deviation >= 0 ? "+" : ""}${pegHealth.deviation.toFixed(3)}%` : "—"}
          isLoading={pegLoading}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold text-gray-800 ${isLoading ? "animate-pulse text-gray-300" : ""}`}>
        {isLoading ? "Loading…" : value}
      </p>
    </div>
  );
}
