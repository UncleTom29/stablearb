"use client";

import { useIncidents } from "@/lib/hooks/useIncidents";
import IncidentLog      from "@/components/IncidentLog";

export default function IncidentsPage() {
  const { incidents, isLoading, refetch } = useIncidents();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Peg Defense History</h1>
          <p className="mt-1 text-sm text-gray-500">
            All peg-defense actions emitted as{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">PegDefenseTriggered</code>{" "}
            events on Sepolia.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-indigo-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      <IncidentLog incidents={incidents} isLoading={isLoading} />

      {!isLoading && incidents.length > 0 && (
        <p className="text-center text-xs text-gray-400">
          {incidents.length} incident{incidents.length !== 1 ? "s" : ""} recorded
        </p>
      )}
    </div>
  );
}
