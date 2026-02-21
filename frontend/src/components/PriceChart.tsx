"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export interface PricePoint {
  time:  string;  // formatted time label
  price: number;  // USD price
}

interface PriceChartProps {
  data:      PricePoint[];
  isLoading?: boolean;
}

export default function PriceChart({ data, isLoading }: PriceChartProps) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <span className="text-gray-400 animate-pulse">Loading chart…</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        SUSD/USD 24h Price
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0.98, 1.02]}
            tickFormatter={(v: number) => `$${v.toFixed(3)}`}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(6)}`, "SUSD/USD"]}
            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
          />
          {/* Peg target */}
          <ReferenceLine y={1.0}   stroke="#10b981" strokeDasharray="4 2" label={{ value: "$1.00", position: "right", fontSize: 10, fill: "#10b981" }} />
          {/* Lower band */}
          <ReferenceLine y={0.995} stroke="#ef4444" strokeDasharray="2 4" />
          {/* Upper band */}
          <ReferenceLine y={1.005} stroke="#f59e0b" strokeDasharray="2 4" />

          <Line
            type="monotone"
            dataKey="price"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
