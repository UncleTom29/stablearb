"use client";

interface CollateralRatioBarProps {
  ratio?:     number;  // e.g. 150 = 150 %
  isLoading?: boolean;
}

const MIN_RATIO          = 150;
const LIQUIDATION_RATIO  = 120;

export default function CollateralRatioBar({ ratio, isLoading }: CollateralRatioBarProps) {
  if (isLoading) {
    return (
      <div className="h-20 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse" />
    );
  }

  const displayRatio = ratio === undefined ? undefined : ratio > 1000 ? 1000 : ratio;
  const pct          = displayRatio !== undefined ? Math.min(displayRatio / 5, 100) : 0;

  const barColor =
    displayRatio === undefined   ? "bg-gray-300" :
    displayRatio < LIQUIDATION_RATIO ? "bg-red-500" :
    displayRatio < MIN_RATIO     ? "bg-amber-400" :
                                   "bg-emerald-500";

  const label =
    displayRatio === undefined   ? "—"              :
    displayRatio > 1000          ? ">1000%"          :
                                   `${displayRatio}%`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">Collateral Ratio</span>
        <span className={`text-lg font-bold ${
          displayRatio !== undefined && displayRatio < LIQUIDATION_RATIO
            ? "text-red-600"
            : displayRatio !== undefined && displayRatio < MIN_RATIO
            ? "text-amber-600"
            : "text-emerald-600"
        }`}>
          {label}
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-400">
        <span>0%</span>
        <span className="text-red-400">120% liq.</span>
        <span className="text-amber-400">150% min</span>
        <span>500%+</span>
      </div>
    </div>
  );
}
