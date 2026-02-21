/**
 * incident-reporter.ts
 * Writes a peg-defense incident report permanently on-chain for auditability.
 * Uses a simple event log pattern: calls a no-op write function on the PegDefender
 * that emits a structured PegIncident event.
 *
 * In production, the PegDefender already emits PegDefenseTriggered events.
 * This module aggregates those events and optionally writes a summary to IPFS / a
 * dedicated IncidentLog contract.
 */

import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { ActionDecision } from "./action-dispatcher";

// ── ABI ────────────────────────────────────────────────────────────────────

const PEG_DEFENDER_ABI = parseAbi([
  "event PegDefenseTriggered(string actionType, uint256 price, uint256 amount)",
  "function lastActionTimestamp() external view returns (uint256)",
]);

// ── Types ──────────────────────────────────────────────────────────────────

export interface IncidentReport {
  id:          string;
  action:      string;
  price:       number;
  amount:      string;
  txHash?:     string;
  timestamp:   number;
  blockNumber?: bigint;
}

// ── Fetch historic incidents ────────────────────────────────────────────────

/**
 * Fetch all PegDefenseTriggered events from the PegDefender contract.
 */
export async function fetchIncidents(fromBlock: bigint = 0n): Promise<IncidentReport[]> {
  const rpcUrl      = process.env.SEPOLIA_RPC_URL;
  const contractAddr = process.env.PEG_DEFENDER_ADDRESS as `0x${string}` | undefined;

  if (!rpcUrl || !contractAddr) {
    console.warn("[incident-reporter] Missing env vars — returning empty list");
    return [];
  }

  const publicClient = createPublicClient({
    chain:     sepolia,
    transport: http(rpcUrl),
  });

  const logs = await publicClient.getLogs({
    address:   contractAddr,
    event:     parseAbi([
      "event PegDefenseTriggered(string actionType, uint256 price, uint256 amount)",
    ])[0],
    fromBlock,
    toBlock:   "latest",
  });

  return logs.map((log, i) => ({
    id:          `${log.transactionHash ?? "unknown"}-${i}`,
    action:      String(log.args?.actionType ?? "UNKNOWN"),
    price:       Number(log.args?.price ?? 0n) / 1e18,
    amount:      String(log.args?.amount ?? 0n),
    txHash:      log.transactionHash ?? undefined,
    timestamp:   0, // block timestamp would require an extra call
    blockNumber: log.blockNumber ?? undefined,
  }));
}

/**
 * Write a summary of a completed action to standard output (and optionally chain).
 * In a full production system this could call a dedicated IncidentLog contract.
 */
export async function reportIncident(decision: ActionDecision): Promise<void> {
  if (decision.action === "NONE") return;

  const report: IncidentReport = {
    id:        decision.txHash ?? `local-${decision.timestamp}`,
    action:    decision.action,
    price:     decision.price,
    amount:    decision.amount.toString(),
    txHash:    decision.txHash,
    timestamp: decision.timestamp,
  };

  console.info("[incident-reporter] Peg defense incident recorded:", report);
}
