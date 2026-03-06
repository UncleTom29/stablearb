/**
 * peg-monitor.test.ts
 * Unit tests for the peg monitor price fetching logic.
 */

import type { Runtime } from "@chainlink/cre-sdk";
import { fetchSusdPrice } from "./peg-monitor";

/** Creates a minimal mock Runtime for testing. */
function createMockRuntime(secrets: Record<string, string> = {}): Runtime<any> {
  return {
    config: {},
    log: jest.fn(),
    now: () => new Date(),
    callCapability: jest.fn(),
    runInNodeMode: jest.fn(),
    report: jest.fn(),
    getSecret: jest.fn().mockImplementation(({ id }: { id: string }) => ({
      result: () => {
        if (!secrets[id]) throw new Error(`Secret not found: ${id}`);
        return { value: secrets[id] };
      },
    })),
  } as unknown as Runtime<any>;
}

describe("fetchSusdPrice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fallback behavior", () => {
    it("returns default fallback (price=1.0) when secrets are missing", () => {
      // Runtime with no secrets — getSecret throws
      const runtime = createMockRuntime({});

      const result = fetchSusdPrice(runtime);

      expect(result.price).toBe(1.0);
      expect(result.source).toBe("default");
      expect(result.confidence).toBe("low");
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("returns fallback when Data Streams aggregation throws", () => {
      const mockSdk = require("@chainlink/cre-sdk");
      mockSdk.HTTPClient.mockImplementationOnce(() => ({
        sendRequest: jest.fn().mockImplementation(() => {
          throw new Error("Network error");
        }),
      }));

      const runtime = createMockRuntime({
        DATA_STREAMS_CLIENT_ID: "client-id",
        DATA_STREAMS_CLIENT_SECRET: "client-secret",
      });

      const result = fetchSusdPrice(runtime);

      expect(result.price).toBe(1.0);
      expect(result.source).toBe("default");
      expect(result.confidence).toBe("low");
    });
  });

  describe("return shape", () => {
    it("always returns an object with price, source, timestamp, and confidence fields", () => {
      const runtime = createMockRuntime({});

      const result = fetchSusdPrice(runtime);

      expect(typeof result.price).toBe("number");
      expect(typeof result.source).toBe("string");
      expect(typeof result.timestamp).toBe("number");
      expect(["high", "medium", "low"]).toContain(result.confidence);
    });
  });
});
