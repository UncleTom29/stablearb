"use client";

import { useQuery } from "@tanstack/react-query";

export interface PegHealth {
  price:     number;
  source:    string;
  timestamp: number;
  status:    "HEALTHY" | "BELOW_PEG" | "ABOVE_PEG";
  deviation: number; // percentage
}

export function usePegHealth() {
  const { data, isLoading, error, refetch } = useQuery<PegHealth>({
    queryKey:        ["peg-health"],
    queryFn:         fetchPegHealth,
    refetchInterval: 30_000, // refresh every 30 seconds
    staleTime:       15_000,
  });

  return { pegHealth: data, isLoading, error, refetch };
}

async function fetchPegHealth(): Promise<PegHealth> {
  const res = await fetch("/api/peg-price");
  if (!res.ok) throw new Error("Failed to fetch peg price");

  const json = await res.json() as { price: number; source: string; timestamp: number };
  const price     = json.price;
  const deviation = ((price - 1.0) / 1.0) * 100;
  let   status: PegHealth["status"] = "HEALTHY";

  if (price < 0.995)  status = "BELOW_PEG";
  else if (price > 1.005) status = "ABOVE_PEG";

  return {
    price,
    source:    json.source,
    timestamp: json.timestamp,
    status,
    deviation,
  };
}
