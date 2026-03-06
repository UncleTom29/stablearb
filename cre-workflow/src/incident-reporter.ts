/**
 * incident-reporter.ts
 * Writes a peg-defense incident log.
 */

import type { Runtime } from "@chainlink/cre-sdk";
import type { ActionDecision } from "./action-dispatcher";

export interface IncidentReport {
  id: string;
  action: string;
  price: number;
  amount: string;
  txHash?: string;
  timestamp: number;
}

/**
 * Write a summary of a completed action to telemetry.
 * Because we use completely decentralized EVM write logic in `action-dispatcher`,
 * the report event is emitted on-chain implicitly.
 */
export async function reportIncident(runtime: Runtime<any>, decision: ActionDecision): Promise<void> {
  if (decision.action === "NONE") return;

  const report: IncidentReport = {
    id: decision.txHash ?? `local-${decision.timestamp}`,
    action: decision.action,
    price: decision.price,
    amount: decision.amount.toString(),
    txHash: decision.txHash,
    timestamp: decision.timestamp,
  };

  console.info("[incident-reporter] Peg defense incident recorded:", JSON.stringify(report));
}
