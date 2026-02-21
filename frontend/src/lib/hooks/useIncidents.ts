"use client";

import { useQuery } from "@tanstack/react-query";

export interface Incident {
  id:          string;
  action:      "BUYBACK" | "MINT";
  price:       number;
  amount:      string;
  txHash?:     string;
  timestamp:   number;
  blockNumber?: string;
}

export function useIncidents() {
  const { data, isLoading, error, refetch } = useQuery<Incident[]>({
    queryKey:        ["incidents"],
    queryFn:         fetchIncidents,
    refetchInterval: 60_000, // refresh every minute
    staleTime:       30_000,
  });

  return { incidents: data ?? [], isLoading, error, refetch };
}

async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/incidents");
  if (!res.ok) throw new Error("Failed to fetch incidents");
  return res.json() as Promise<Incident[]>;
}
