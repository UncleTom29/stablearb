/**
 * app/api/incidents/route.ts
 * Fetches PegDefenseTriggered events from the PegDefender contract on Sepolia.
 */

import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

const PEG_DEFENDER_ADDRESS =
  (process.env.NEXT_PUBLIC_PEG_DEFENDER_ADDRESS ?? "") as `0x${string}`;

const PEG_DEFENDER_ABI = parseAbi([
  "event PegDefenseTriggered(string actionType, uint256 price, uint256 amount)",
]);

export async function GET() {
  if (!PEG_DEFENDER_ADDRESS || PEG_DEFENDER_ADDRESS === "0x") {
    return NextResponse.json([]);
  }

  try {
    const client = createPublicClient({
      chain:     sepolia,
      transport: http(process.env.SEPOLIA_RPC_URL ?? ""),
    });

    const logs = await client.getLogs({
      address:  PEG_DEFENDER_ADDRESS,
      event:    PEG_DEFENDER_ABI[0],
      fromBlock: 0n,
      toBlock:  "latest",
    });

    const incidents = logs.map((log, i) => ({
      id:          `${log.transactionHash ?? "unknown"}-${i}`,
      action:      String(log.args?.actionType ?? "UNKNOWN"),
      price:       Number(log.args?.price ?? 0n) / 1e18,
      amount:      String(log.args?.amount ?? 0n),
      txHash:      log.transactionHash ?? undefined,
      timestamp:   0,
      blockNumber: String(log.blockNumber ?? ""),
    }));

    return NextResponse.json(incidents);
  } catch (err) {
    console.error("[api/incidents] Error:", err);
    return NextResponse.json([]);
  }
}
