"use client";

import type { PegHealth } from "@/lib/hooks/usePegHealth";

interface PegGaugeProps {
  pegHealth?: PegHealth;
  isLoading?: boolean;
}

export default function PegGauge({ pegHealth, isLoading }: PegGaugeProps) {
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <span className="text-gray-400 animate-pulse">Loading peg data…</span>
      </div>
    );
  }

  const price     = pegHealth?.price     ?? 1.0;
  const deviation = pegHealth?.deviation ?? 0;
  const status    = pegHealth?.status    ?? "HEALTHY";

  const statusColor =
    status === "HEALTHY"   ? "text-emerald-600" :
    status === "BELOW_PEG" ? "text-red-500"     :
                             "text-amber-500";

  const statusBg =
    status === "HEALTHY"   ? "bg-emerald-50 border-emerald-200" :
    status === "BELOW_PEG" ? "bg-red-50 border-red-200"         :
                             "bg-amber-50 border-amber-200";

  const statusLabel =
    status === "HEALTHY"   ? "✅ Healthy"    :
    status === "BELOW_PEG" ? "🔴 Below Peg" :
                             "🟡 Above Peg";

  // Build a simple needle gauge: clamp deviation to ±5 %
  const clampedDev = Math.max(-5, Math.min(5, deviation));
  const needlePct  = ((clampedDev + 5) / 10) * 100;

  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${statusBg}`}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
        SUSD Peg Status
      </h2>

      {/* Price */}
      <p className={`text-4xl font-bold ${statusColor}`}>
        ${price.toFixed(4)}
      </p>
      <p className={`mt-1 text-sm font-medium ${statusColor}`}>{statusLabel}</p>

      {/* Gauge bar */}
      <div className="mt-4">
        <div className="relative h-3 rounded-full bg-gray-200">
          {/* Healthy band */}
          <div
            className="absolute h-full rounded-full bg-emerald-400 opacity-30"
            style={{ left: "45%", width: "10%" }}
          />
          {/* Needle */}
          <div
            className={`absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full transition-all ${
              status === "HEALTHY"   ? "bg-emerald-500" :
              status === "BELOW_PEG" ? "bg-red-500"      :
                                       "bg-amber-500"
            }`}
            style={{ left: `calc(${needlePct}% - 3px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>$0.95</span>
          <span>$1.00</span>
          <span>$1.05</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Deviation: {deviation >= 0 ? "+" : ""}{deviation.toFixed(3)}% &nbsp;·&nbsp;
        Source: {pegHealth?.source ?? "—"}
      </p>
    </div>
  );
}
