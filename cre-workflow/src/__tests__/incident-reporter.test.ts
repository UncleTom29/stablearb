/**
 * incident-reporter.test.ts
 * Unit tests for peg-defense incident fetching and reporting.
 */

import { fetchIncidents, reportIncident } from "../incident-reporter";
import type { ActionDecision } from "../action-dispatcher";

// ── Viem mock ─────────────────────────────────────────────────────────────

const mockGetLogs = jest.fn();

jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  createPublicClient: jest.fn(() => ({ getLogs: mockGetLogs })),
  parseAbi:           jest.requireActual("viem").parseAbi,
  http:               jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function makeDecision(
  overrides: Partial<ActionDecision> = {}
): ActionDecision {
  return {
    action:    "BUYBACK",
    price:     0.99,
    amount:    1000n * 10n ** 18n,
    reason:    "SUSD below peg",
    txHash:    "0xdeadbeef",
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ── fetchIncidents ────────────────────────────────────────────────────────

describe("fetchIncidents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SEPOLIA_RPC_URL        = "https://rpc.test";
    process.env.PEG_DEFENDER_ADDRESS   = "0x1234567890123456789012345678901234567890";
  });

  afterEach(() => {
    delete process.env.SEPOLIA_RPC_URL;
    delete process.env.PEG_DEFENDER_ADDRESS;
  });

  it("returns empty array when env vars are missing", async () => {
    delete process.env.SEPOLIA_RPC_URL;
    delete process.env.PEG_DEFENDER_ADDRESS;

    const incidents = await fetchIncidents();
    expect(incidents).toEqual([]);
  });

  it("maps on-chain PegDefenseTriggered logs to IncidentReport objects", async () => {
    const price18 = BigInt(Math.round(0.99 * 1e18));
    const amount  = 1_000n * 10n ** 18n;

    mockGetLogs.mockResolvedValueOnce([
      {
        transactionHash: "0xabc",
        blockNumber:     100n,
        args: {
          actionType: "BUYBACK",
          price:      price18,
          amount,
        },
      },
    ]);

    const incidents = await fetchIncidents();

    expect(incidents).toHaveLength(1);
    const [report] = incidents;
    expect(report.action).toBe("BUYBACK");
    expect(report.price).toBeCloseTo(0.99, 3);
    expect(report.amount).toBe(amount.toString());
    expect(report.txHash).toBe("0xabc");
    expect(report.blockNumber).toBe(100n);
  });

  it("handles multiple log entries", async () => {
    const price18 = BigInt(Math.round(1.01 * 1e18));

    mockGetLogs.mockResolvedValueOnce([
      {
        transactionHash: "0xaaa",
        blockNumber:     200n,
        args: { actionType: "MINT",    price: price18, amount: 500n * 10n ** 18n },
      },
      {
        transactionHash: "0xbbb",
        blockNumber:     201n,
        args: { actionType: "BUYBACK", price: price18, amount: 200n * 10n ** 18n },
      },
    ]);

    const incidents = await fetchIncidents();
    expect(incidents).toHaveLength(2);
    expect(incidents[0].action).toBe("MINT");
    expect(incidents[1].action).toBe("BUYBACK");
  });

  it("uses fromBlock parameter when provided", async () => {
    mockGetLogs.mockResolvedValueOnce([]);
    await fetchIncidents(500n);

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 500n })
    );
  });

  it("handles logs with null transactionHash gracefully", async () => {
    mockGetLogs.mockResolvedValueOnce([
      {
        transactionHash: null,
        blockNumber:     null,
        args: { actionType: "MINT", price: 1n * 10n ** 18n, amount: 100n },
      },
    ]);

    const incidents = await fetchIncidents();
    expect(incidents[0].txHash).toBeUndefined();
    expect(incidents[0].blockNumber).toBeUndefined();
  });
});

// ── reportIncident ────────────────────────────────────────────────────────

describe("reportIncident", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("does nothing when action is NONE", async () => {
    await reportIncident(makeDecision({ action: "NONE", txHash: undefined }));
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("logs the incident for BUYBACK action", async () => {
    await reportIncident(makeDecision({ action: "BUYBACK" }));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[incident-reporter]"),
      expect.objectContaining({ action: "BUYBACK" })
    );
  });

  it("logs the incident for MINT action", async () => {
    await reportIncident(makeDecision({ action: "MINT" }));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[incident-reporter]"),
      expect.objectContaining({ action: "MINT" })
    );
  });

  it("includes txHash in the reported incident", async () => {
    const txHash = "0xcafebabe";
    await reportIncident(makeDecision({ txHash }));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ txHash })
    );
  });

  it("uses local id when txHash is undefined", async () => {
    await reportIncident(makeDecision({ txHash: undefined }));
    const [, report] = consoleSpy.mock.calls[0];
    expect((report as { id: string }).id).toMatch(/^local-/);
  });
});
