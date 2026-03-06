/**
 * action-dispatcher.ts
 * Decides and executes peg-defense actions based on the current SUSD/USD price.
 */

import { EVMClient, type Runtime, prepareReportRequest } from "@chainlink/cre-sdk";
import { parseAbiParameters, encodeAbiParameters, type Hex, bytesToHex } from "viem";
import { type PriceResult } from "./peg-monitor";

export type ActionType = "BUYBACK" | "MINT" | "NONE";

export interface ActionDecision {
  action: ActionType;
  price: number;
  amount: bigint;
  reason: string;
  txHash?: string;
  timestamp: number;
}

const DEFAULT_MAX_ACTION_AMOUNT = BigInt("10000000000000000000000");

/**
 * Main dispatcher. Off-chain logic determines if peg defense is needed.
 * Sync-style implementation using .result()
 */
export function dispatchAction(runtime: Runtime<any>, priceResult: PriceResult): ActionDecision {
  const { price, confidence } = priceResult;
  const timestamp = Math.floor(Date.now() / 1000);

  if (confidence === "low") {
    return {
      action: "NONE",
      price,
      amount: 0n,
      reason: "Low confidence price logs — skipping action",
      timestamp,
    };
  }

  let action: ActionType = "NONE";
  let reason = "Peg stable ($0.995 - $1.005)";

  if (price < 0.995) {
    action = "BUYBACK";
    reason = `SUSD below peg ($${price.toFixed(4)}) — buying back circulating supply`;
  } else if (price > 1.005) {
    action = "MINT";
    reason = `SUSD above peg ($${price.toFixed(4)}) — minting new supply`;
  }

  if (action === "NONE") {
    return { action, price, amount: 0n, reason, timestamp };
  }

  // Calculate dynamic buyback amount based on deviation
  const amount = calculateAmount(price);
  runtime.log(`[action-dispatcher] ${reason} | Action Amount: ${amount}`);

  // Execute on-chain via Keystone Forwarder
  const txHash = executeOnChain(runtime, action, price, amount);

  return { action, price, amount, reason, txHash, timestamp };
}

function calculateAmount(price: number): bigint {
  const deviation = Math.abs(1.0 - price);
  const scale = BigInt(Math.floor((deviation / 1.0) * 1e18));
  const amount = (DEFAULT_MAX_ACTION_AMOUNT * scale) / BigInt(1e18);
  return amount > DEFAULT_MAX_ACTION_AMOUNT ? DEFAULT_MAX_ACTION_AMOUNT : amount;
}

/**
 * Internal — Dispatches to evmClient.writeReport.
 * All nodes in the DON must have agreed on this same binary report request.
 */
function executeOnChain(
  runtime: Runtime<any>,
  action: ActionType,
  price: number,
  amount: bigint
): string | undefined {
  let contractAddr = "";
  try {
    const secretObj = runtime.getSecret({ id: "PEG_DEFENDER_ADDRESS" }).result();
    contractAddr = secretObj.value || "0x216760e96222bCe5DC454a3353364FaD8C088999";
  } catch (e) {
    contractAddr = "0x216760e96222bCe5DC454a3353364FaD8C088999";
  }

  let chainId = 11155111; // Default to Sepolia
  try {
    const chainIdStr = runtime.getSecret({ id: "CHAIN_ID" }).result().value;
    chainId = Number(chainIdStr || "11155111");
  } catch (e) { }

  const evmClient = new EVMClient(BigInt(chainId));

  // Encode payload as agreed-upon (uint256, string, uint256) tuple
  const price18 = BigInt(Math.floor(price * 1e18));
  const performData = encodeAbiParameters(
    parseAbiParameters("uint256 price, string actionType, uint256 amount"),
    [price18, action, amount]
  ) as Hex;

  // Transform Hex string to Uint8Array as required by CRE internal protocol
  const hexStringStr = performData.slice(2);
  const dataBytes = new Uint8Array(hexStringStr.length / 2);
  for (let i = 0; i < dataBytes.length; i++) {
    dataBytes[i] = parseInt(hexStringStr.slice(i * 2, i * 2 + 2), 16);
  }

  try {
    // 1. All nodes reach consensus on the binary report request.
    const reportResponse = runtime.report(prepareReportRequest(bytesToHex(dataBytes))).result();

    // 2. All nodes reaches consensus on the write dispatch with the signed report from Step 1.
    const writeResponse = evmClient.writeReport(runtime, {
      report: reportResponse,
      receiver: contractAddr,
    }).result();

    // In production broadcasting, this returns the real txHash.
    if (writeResponse.txHash) {
      const hash = bytesToHex(writeResponse.txHash);
      runtime.log(`[action-dispatcher] EVM Write Successful! Tx: ${hash}`);
      return hash;
    }

    // Fallback for simulation logs
    runtime.log("[action-dispatcher] EVM Write prepared but not broadcast (Simulation mode).");
    return "0xSIMULATED_TRANSACTION";

  } catch (err) {
    runtime.log(`[action-dispatcher] EVM Write failed: ${(err as Error).message}`);
    return undefined;
  }
}
