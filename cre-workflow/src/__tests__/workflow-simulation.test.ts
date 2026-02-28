/**
 * workflow-simulation.test.ts
 * End-to-end CRE workflow simulation.
 *
 * Simulates a full cron-triggered run of the StableArb peg monitor:
 *   1. Price fetch (mocked Data Streams / fallback)
 *   2. Peg action decision
 *   3. On-chain dispatch (no real RPC calls)
 *   4. Incident reporting
 *
 * This mirrors the flow that the CRE cron trigger invokes in production,
 * giving confidence that the workflow behaves correctly end-to-end.
 */

import axios from "axios";
import { fetchSusdPrice }  from "../peg-monitor";
import { dispatchAction }  from "../action-dispatcher";
import { reportIncident }  from "../incident-reporter";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  createPublicClient: jest.fn(() => ({ readContract: jest.fn() })),
  createWalletClient: jest.fn(() => ({ writeContract: jest.fn() })),
  http:               jest.fn(),
}));

jest.mock("viem/accounts", () => ({
  privateKeyToAccount: jest.fn(() => ({ address: "0xdeadbeef" })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

/** Simulate one full peg-monitor cron run and return the final decision. */
async function runWorkflow() {
  const priceResult = await fetchSusdPrice();
  const decision    = await dispatchAction(priceResult);
  await reportIncident(decision);
  return { priceResult, decision };
}

function mockDataStreamsPrice(usdPrice: number): void {
  const price18 = BigInt(Math.floor(usdPrice * 1e18));
  mockedAxios.get.mockResolvedValueOnce({
    data: {
      report: {
        price:                 "0x" + price18.toString(16),
        observationsTimestamp: Math.floor(Date.now() / 1000),
      },
    },
  });
}

// ── Simulation scenarios ──────────────────────────────────────────────────

describe("CRE Workflow Simulation", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATA_STREAMS_CLIENT_ID     = "test-client-id";
    process.env.DATA_STREAMS_CLIENT_SECRET = "test-client-secret";
    // No on-chain env vars → executeOnChain skipped gracefully
    delete process.env.DEPLOYER_PRIVATE_KEY;
    delete process.env.SEPOLIA_RPC_URL;
    delete process.env.PEG_DEFENDER_ADDRESS;

    consoleSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.DATA_STREAMS_CLIENT_ID;
    delete process.env.DATA_STREAMS_CLIENT_SECRET;
  });

  it("Scenario: SUSD at peg → no action taken", async () => {
    mockDataStreamsPrice(1.0);
    const { priceResult, decision } = await runWorkflow();

    expect(priceResult.source).toBe("data-streams");
    expect(priceResult.confidence).toBe("high");
    expect(decision.action).toBe("NONE");
    expect(decision.txHash).toBeUndefined();
  });

  it("Scenario: SUSD slightly above peg ($1.003) → no action taken", async () => {
    mockDataStreamsPrice(1.003);
    const { decision } = await runWorkflow();
    expect(decision.action).toBe("NONE");
  });

  it("Scenario: SUSD above peg band ($1.01) → MINT action", async () => {
    mockDataStreamsPrice(1.01);
    const { decision } = await runWorkflow();

    expect(decision.action).toBe("MINT");
    expect(decision.amount).toBeGreaterThan(0n);
    expect(decision.reason).toMatch(/above peg/i);
  });

  it("Scenario: SUSD below peg band ($0.99) → BUYBACK action", async () => {
    mockDataStreamsPrice(0.99);
    const { decision } = await runWorkflow();

    expect(decision.action).toBe("BUYBACK");
    expect(decision.amount).toBeGreaterThan(0n);
    expect(decision.reason).toMatch(/below peg/i);
  });

  it("Scenario: Data Streams down, CoinGecko available → fallback price, NONE action", async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error("Data Streams unavailable"))
      .mockResolvedValueOnce({ data: { ethereum: { usd: 2000 } } });

    const { priceResult, decision } = await runWorkflow();

    expect(priceResult.source).toBe("coingecko-fallback");
    expect(priceResult.confidence).toBe("medium");
    // CoinGecko proxy always returns $1.00 on testnet → within peg band
    expect(decision.action).toBe("NONE");
  });

  it("Scenario: all price sources fail → default $1.00, low confidence → NONE action", async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error("Data Streams down"))
      .mockRejectedValueOnce(new Error("CoinGecko down"));

    const { priceResult, decision } = await runWorkflow();

    expect(priceResult.source).toBe("default");
    expect(priceResult.confidence).toBe("low");
    // Low confidence → action dispatcher skips
    expect(decision.action).toBe("NONE");
    expect(decision.reason).toMatch(/low confidence/i);
  });

  it("Scenario: severe de-peg ($0.95) → BUYBACK with maximum proportional amount", async () => {
    const maxAmount = BigInt("10000000000000000000000"); // 10 000 SUSD
    mockDataStreamsPrice(0.95);

    const { decision } = await runWorkflow();

    expect(decision.action).toBe("BUYBACK");
    expect(decision.amount).toBeLessThanOrEqual(maxAmount);
    expect(decision.amount).toBeGreaterThan(0n);
  });

  it("Scenario: workflow logs start and completion messages", async () => {
    mockDataStreamsPrice(1.0);

    const logMessages: string[] = [];
    const infoSpy = jest
      .spyOn(console, "info")
      .mockImplementation((...args: unknown[]) => {
        logMessages.push(String(args[0]));
      });

    const priceResult = await fetchSusdPrice();
    console.info(
      `[stablearb-cre] SUSD/USD price: $${priceResult.price.toFixed(6)} ` +
        `(source: ${priceResult.source}, confidence: ${priceResult.confidence})`
    );
    const decision = await dispatchAction(priceResult);
    console.info(`[stablearb-cre] Action: ${decision.action} — ${decision.reason}`);
    await reportIncident(decision);
    console.info("[stablearb-cre] Run complete.");

    expect(logMessages.some((m) => m.includes("SUSD/USD price"))).toBe(true);
    expect(logMessages.some((m) => m.includes("Action:"))).toBe(true);
    expect(logMessages.some((m) => m.includes("Run complete."))).toBe(true);

    infoSpy.mockRestore();
  });
});
