/**
 * action-dispatcher.test.ts
 * Unit tests for the peg-defense action dispatcher logic.
 */

import type { Runtime } from "@chainlink/cre-sdk";
import type { PriceResult } from "./peg-monitor";
import { dispatchAction } from "./action-dispatcher";

/** Creates a minimal mock Runtime for testing. */
function createMockRuntime(secrets: Record<string, string> = {}): Runtime<any> {
  return {
    config: {},
    log: jest.fn(),
    now: () => new Date(),
    callCapability: jest.fn(),
    runInNodeMode: jest.fn(),
    report: jest.fn().mockReturnValue({
      result: () => ({ data: new Uint8Array([1, 2, 3]) }),
    }),
    getSecret: jest.fn().mockImplementation(({ id }: { id: string }) => ({
      result: () => ({ value: secrets[id] ?? "" }),
    })),
  } as unknown as Runtime<any>;
}

const highConfidenceStable: PriceResult = {
  price: 1.0,
  source: "test",
  timestamp: 1000,
  confidence: "high",
};

const lowConfidenceResult: PriceResult = {
  price: 0.9,
  source: "test",
  timestamp: 1000,
  confidence: "low",
};

describe("dispatchAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("NONE path — price within peg band", () => {
    it("returns NONE for price exactly at 1.0", () => {
      const runtime = createMockRuntime();
      const result = dispatchAction(runtime, highConfidenceStable);

      expect(result.action).toBe("NONE");
      expect(result.price).toBe(1.0);
      expect(result.amount).toBe(0n);
      expect(result.reason).toContain("$0.995");
    });

    it("returns NONE for price at lower peg boundary (0.995)", () => {
      const runtime = createMockRuntime();
      const result = dispatchAction(runtime, {
        ...highConfidenceStable,
        price: 0.995,
      });

      expect(result.action).toBe("NONE");
    });

    it("returns NONE for price at upper peg boundary (1.005)", () => {
      const runtime = createMockRuntime();
      const result = dispatchAction(runtime, {
        ...highConfidenceStable,
        price: 1.005,
      });

      expect(result.action).toBe("NONE");
    });
  });

  describe("NONE path — low confidence", () => {
    it("returns NONE immediately when confidence is low, regardless of price", () => {
      const runtime = createMockRuntime();
      const result = dispatchAction(runtime, lowConfidenceResult);

      expect(result.action).toBe("NONE");
      expect(result.amount).toBe(0n);
      expect(result.reason).toContain("Low confidence");
    });
  });

  describe("BUYBACK path — price below peg", () => {
    it("returns BUYBACK when price is below 0.995", () => {
      const runtime = createMockRuntime({
        PEG_DEFENDER_ADDRESS: "0x0000000000000000000000000000000000001111",
        CHAIN_ID: "11155111",
      });

      const result = dispatchAction(runtime, {
        ...highConfidenceStable,
        price: 0.99,
      });

      expect(result.action).toBe("BUYBACK");
      expect(result.price).toBe(0.99);
      expect(result.amount).toBeGreaterThan(0n);
      expect(result.reason).toContain("SUSD below peg");
    });

    it("returns BUYBACK with non-zero amount proportional to deviation", () => {
      const runtime = createMockRuntime({
        PEG_DEFENDER_ADDRESS: "0x0000000000000000000000000000000000001111",
        CHAIN_ID: "11155111",
      });

      const smallDeviation = dispatchAction(runtime, {
        ...highConfidenceStable,
        price: 0.994,
      });
      const largeDeviation = dispatchAction(runtime, {
        ...highConfidenceStable,
        price: 0.9,
      });

      expect(largeDeviation.amount).toBeGreaterThan(smallDeviation.amount);
    });
  });

  describe("MINT path — price above peg", () => {
    it("returns MINT when price is above 1.005", () => {
      const runtime = createMockRuntime({
        PEG_DEFENDER_ADDRESS: "0x0000000000000000000000000000000000001111",
        CHAIN_ID: "11155111",
      });

      const result = dispatchAction(runtime, {
        ...highConfidenceStable,
        price: 1.01,
      });

      expect(result.action).toBe("MINT");
      expect(result.price).toBe(1.01);
      expect(result.amount).toBeGreaterThan(0n);
      expect(result.reason).toContain("SUSD above peg");
    });
  });

  describe("timestamps", () => {
    it("includes a timestamp in the result", () => {
      const runtime = createMockRuntime();
      const before = Math.floor(Date.now() / 1000);
      const result = dispatchAction(runtime, highConfidenceStable);
      const after = Math.floor(Date.now() / 1000);

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
