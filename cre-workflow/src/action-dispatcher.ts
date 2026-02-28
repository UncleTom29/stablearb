/**
 * action-dispatcher.ts
 * Decides and executes peg-defense actions based on the current SUSD/USD price.
 * Calls the PegDefender contract's performUpkeep (or a helper tx) when needed.
 */

import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  parseAbi,
  parseAbiParameters,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { type PriceResult } from "./peg-monitor";

// ── Constants ──────────────────────────────────────────────────────────────

const PEG_TARGET = 1.0;
const PEG_LOWER  = 0.995;
const PEG_UPPER  = 1.005;

// ── ABI snippets ───────────────────────────────────────────────────────────

const PEG_DEFENDER_ABI = parseAbi([
  "function performUpkeep(bytes calldata performData) external",
  "function lastActionTimestamp() external view returns (uint256)",
  "function cooldown() external view returns (uint256)",
]);

// ── Types ──────────────────────────────────────────────────────────────────

export type ActionType = "BUYBACK" | "MINT" | "NONE";

export interface ActionDecision {
  action:    ActionType;
  price:     number;
  amount:    bigint;
  reason:    string;
  txHash?:   string;
  timestamp: number;
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Evaluate the peg status and dispatch a defense action if required.
 */
export async function dispatchAction(
  priceResult: PriceResult
): Promise<ActionDecision> {
  const { price, confidence } = priceResult;
  const timestamp = Math.floor(Date.now() / 1000);

  // Skip low-confidence prices
  if (confidence === "low") {
    return {
      action:    "NONE",
      price,
      amount:    0n,
      reason:    "Low confidence price — skipping action",
      timestamp,
    };
  }

  let action: ActionType = "NONE";
  let reason = "Price within peg band";

  if (price < PEG_LOWER) {
    action = "BUYBACK";
    reason = `SUSD below peg ($${price.toFixed(4)}) — buying back supply`;
  } else if (price > PEG_UPPER) {
    action = "MINT";
    reason = `SUSD above peg ($${price.toFixed(4)}) — minting supply`;
  }

  if (action === "NONE") {
    return { action, price, amount: 0n, reason, timestamp };
  }

  const amount = calculateAmount(price);
  console.info(`[action-dispatcher] ${reason} | Amount: ${amount}`);

  // Execute on-chain
  const txHash = await executeOnChain(action, price, amount);

  return { action, price, amount, reason, txHash, timestamp };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// 10,000 SUSD expressed in 18-decimal wei units — used when MAX_ACTION_AMOUNT env var is absent
const DEFAULT_MAX_ACTION_AMOUNT = BigInt("10000000000000000000000");

function calculateAmount(price: number): bigint {
  const maxAmount = BigInt(process.env.MAX_ACTION_AMOUNT ?? DEFAULT_MAX_ACTION_AMOUNT.toString());
  const deviation = Math.abs(PEG_TARGET - price);
  const scale     = BigInt(Math.floor((deviation / PEG_TARGET) * 1e18));
  const amount    = (maxAmount * scale) / BigInt(1e18);
  return amount > maxAmount ? maxAmount : amount;
}

async function executeOnChain(
  action: ActionType,
  price:  number,
  amount: bigint
): Promise<string | undefined> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  const rpcUrl     = process.env.SEPOLIA_RPC_URL;
  const contractAddr = process.env.PEG_DEFENDER_ADDRESS as `0x${string}` | undefined;

  if (!privateKey || !rpcUrl || !contractAddr) {
    console.warn("[action-dispatcher] Missing env vars — skipping on-chain execution");
    return undefined;
  }

  const account       = privateKeyToAccount(privateKey);
  const publicClient  = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient  = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  // Check cooldown
  const [lastAction, cooldown] = await Promise.all([
    publicClient.readContract({
      address: contractAddr,
      abi:     PEG_DEFENDER_ABI,
      functionName: "lastActionTimestamp",
    }),
    publicClient.readContract({
      address: contractAddr,
      abi:     PEG_DEFENDER_ABI,
      functionName: "cooldown",
    }),
  ]);

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < lastAction + cooldown) {
    console.info("[action-dispatcher] Cooldown active — skipping on-chain execution");
    return undefined;
  }

  // Encode performData as (uint256 price18, bool isFallback)
  const price18 = BigInt(Math.floor(price * 1e18));
  const performData = encodeAbiParameters(
    parseAbiParameters("uint256 price, bool isFallback"),
    [price18, true]
  ) as Hex;

  const hash = await walletClient.writeContract({
    address:      contractAddr,
    abi:          PEG_DEFENDER_ABI,
    functionName: "performUpkeep",
    args:         [performData],
  });

  console.info("[action-dispatcher] Tx submitted:", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
