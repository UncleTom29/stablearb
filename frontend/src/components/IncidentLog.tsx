"use client";

import type { Incident } from "@/lib/hooks/useIncidents";

interface IncidentLogProps {
  incidents:  Incident[];
  isLoading?: boolean;
}

export default function IncidentLog({ incidents, isLoading }: IncidentLogProps) {
  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <span className="text-gray-400 animate-pulse">Loading incidents…</span>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-gray-400">No peg-defense incidents recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Price</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Amount (SUSD)</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Block</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Tx</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {incidents.map((incident) => (
            <tr key={incident.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    incident.action === "BUYBACK"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {incident.action}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700">${incident.price.toFixed(4)}</td>
              <td className="px-4 py-3 text-gray-700">
                {(Number(incident.amount) / 1e18).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-4 py-3 text-gray-500">{incident.blockNumber ?? "—"}</td>
              <td className="px-4 py-3">
                {incident.txHash ? (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${incident.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:underline truncate max-w-[100px] inline-block"
                  >
                    {incident.txHash.slice(0, 8)}…
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
