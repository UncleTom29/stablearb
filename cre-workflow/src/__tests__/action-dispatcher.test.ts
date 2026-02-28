/**
 * action-dispatcher.test.ts
 * Unit tests for the peg-action decision and on-chain dispatch logic.
 */

import { dispatchAction, type ActionDecision } from "../action-dispatcher";
import type { PriceResult } from "../peg-monitor";

// ── Viem mock ─────────────────────────────────────────────────────────────
// Mock the viem clients so tests never make real RPC calls.

const mockReadContract   = jest.fn();
const mockWriteContract  = jest.fn();
const mockWaitForReceipt = jest.fn();

jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  createPublicClient: jest.fn(() => ({
    readContract: mockReadContract,
  })),
  createWalletClient: jest.fn(() => ({
    writeContract: mockWriteContract,
  })),
  http: jest.fn(),
}));

jest.mock("viem/accounts", () => ({
  privateKeyToAccount: jest.fn(() => ({ address: "0xdeadbeef" })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function price(
  usd: number,
  confidence: PriceResult["confidence"] = "high"
): PriceResult {
  return {
    price:      usd,
    source:     "test",
    timestamp:  Math.floor(Date.now() / 1000),
    confidence,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────

describe("dispatchAction — decision logic (no on-chain calls)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No env vars → executeOnChain will skip gracefully
    delete process.env.DEPLOYER_PRIVATE_KEY;
    delete process.env.SEPOLIA_RPC_URL;
    delete process.env.PEG_DEFENDER_ADDRESS;
  });

  it("returns NONE when price is exactly at peg", async () => {
    const result = await dispatchAction(price(1.0));
    expect(result.action).toBe("NONE");
    expect(result.amount).toBe(0n);
  });

  it("returns NONE when price is within the upper band boundary", async () => {
    const result = await dispatchAction(price(1.005));
    expect(result.action).toBe("NONE");
  });

  it("returns NONE when price is within the lower band boundary", async () => {
    const result = await dispatchAction(price(0.995));
    expect(result.action).toBe("NONE");
  });

  it("returns BUYBACK when price is below peg band", async () => {
    const result = await dispatchAction(price(0.99));
    expect(result.action).toBe("BUYBACK");
    expect(result.reason).toMatch(/below peg/i);
  });

  it("returns MINT when price is above peg band", async () => {
    const result = await dispatchAction(price(1.02));
    expect(result.action).toBe("MINT");
    expect(result.reason).toMatch(/above peg/i);
  });

  it("returns NONE and skips action on low-confidence price", async () => {
    const result = await dispatchAction(price(0.90, "low"));
    expect(result.action).toBe("NONE");
    expect(result.reason).toMatch(/low confidence/i);
    expect(result.txHash).toBeUndefined();
  });

  it("calculates a non-zero action amount proportional to deviation", async () => {
    const belowPeg = await dispatchAction(price(0.98));
    const furtherBelow = await dispatchAction(price(0.95));

    expect(belowPeg.amount).toBeGreaterThan(0n);
    expect(furtherBelow.amount).toBeGreaterThan(belowPeg.amount);
  });

  it("caps action amount at MAX_ACTION_AMOUNT", async () => {
    const maxAmount = BigInt("10000000000000000000000"); // 10,000 SUSD
    // Extreme deviation
    const result = await dispatchAction(price(0.001));
    expect(result.amount).toBeLessThanOrEqual(maxAmount);
  });

  it("respects custom MAX_ACTION_AMOUNT env var", async () => {
    process.env.MAX_ACTION_AMOUNT = "5000000000000000000000"; // 5,000 SUSD
    const result = await dispatchAction(price(0.001));
    expect(result.amount).toBeLessThanOrEqual(BigInt("5000000000000000000000"));
    delete process.env.MAX_ACTION_AMOUNT;
  });
});

describe("dispatchAction — on-chain execution", () => {
  const PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const RPC_URL     = "https://rpc.test";
  const CONTRACT    = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEPLOYER_PRIVATE_KEY    = PRIVATE_KEY;
    process.env.SEPOLIA_RPC_URL         = RPC_URL;
    process.env.PEG_DEFENDER_ADDRESS    = CONTRACT;
  });

  afterEach(() => {
    delete process.env.DEPLOYER_PRIVATE_KEY;
    delete process.env.SEPOLIA_RPC_URL;
    delete process.env.PEG_DEFENDER_ADDRESS;
  });

  it("skips on-chain call when cooldown is active", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    // lastActionTimestamp = now, cooldown = 300 (5 min) → still cooling down
    mockReadContract
      .mockResolvedValueOnce(now)  // lastActionTimestamp
      .mockResolvedValueOnce(300n); // cooldown

    const result = await dispatchAction(price(0.98));
    expect(result.action).toBe("BUYBACK");
    expect(result.txHash).toBeUndefined();
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("submits tx when cooldown has elapsed", async () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 600); // 10 min ago
    mockReadContract
      .mockResolvedValueOnce(past)  // lastActionTimestamp
      .mockResolvedValueOnce(300n); // cooldown

    const fakeTxHash = "0xabc123";
    mockWriteContract.mockResolvedValueOnce(fakeTxHash);
    // mock waitForTransactionReceipt on the public client
    const { createPublicClient } = await import("viem");
    (createPublicClient as jest.Mock).mockReturnValue({
      readContract:                mockReadContract,
      waitForTransactionReceipt:   mockWaitForReceipt.mockResolvedValueOnce({}),
    });

    const result = await dispatchAction(price(0.98));
    expect(result.txHash).toBe(fakeTxHash);
  });
});
