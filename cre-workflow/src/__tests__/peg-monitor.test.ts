/**
 * peg-monitor.test.ts
 * Unit tests for the SUSD/USD price fetching logic.
 */

import axios from "axios";
import { fetchSusdPrice } from "../peg-monitor";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const BASE_ENV = {
  DATA_STREAMS_CLIENT_ID:     "test-client-id",
  DATA_STREAMS_CLIENT_SECRET: "test-client-secret",
  DATA_STREAMS_ENDPOINT:      "https://api.testnet-dataengine.chain.link",
};

describe("fetchSusdPrice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, BASE_ENV);
  });

  afterEach(() => {
    delete process.env.DATA_STREAMS_CLIENT_ID;
    delete process.env.DATA_STREAMS_CLIENT_SECRET;
  });

  describe("Data Streams path (primary)", () => {
    it("returns high-confidence price when Data Streams succeeds", async () => {
      const price18 = BigInt(Math.round(1.003 * 1e18));
      const nowSec  = Math.floor(Date.now() / 1000);

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          report: {
            price:                  "0x" + price18.toString(16),
            observationsTimestamp:  nowSec,
          },
        },
      });

      const result = await fetchSusdPrice();

      expect(result.source).toBe("data-streams");
      expect(result.confidence).toBe("high");
      expect(result.price).toBeCloseTo(1.003, 4);
      expect(result.timestamp).toBe(nowSec);
    });

    it("falls back when Data Streams returns no report body", async () => {
      // Data Streams returns 200 but with no `report` key
      mockedAxios.get
        .mockResolvedValueOnce({ data: {} })            // Data Streams: no report
        .mockResolvedValueOnce({                        // CoinGecko fallback
          data: { ethereum: { usd: 3000 } },
        });

      const result = await fetchSusdPrice();

      expect(result.source).toBe("coingecko-fallback");
      expect(result.confidence).toBe("medium");
      expect(result.price).toBe(1.0); // testnet proxy always returns $1
    });

    it("falls back to CoinGecko when Data Streams throws a network error", async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error("Network timeout"))  // Data Streams error
        .mockResolvedValueOnce({
          data: { ethereum: { usd: 2000 } },
        });

      const result = await fetchSusdPrice();

      expect(result.source).toBe("coingecko-fallback");
      expect(result.confidence).toBe("medium");
    });

    it("throws when DATA_STREAMS credentials are missing", async () => {
      delete process.env.DATA_STREAMS_CLIENT_ID;
      delete process.env.DATA_STREAMS_CLIENT_SECRET;

      // Without credentials the Data Streams helper throws, triggering CoinGecko
      mockedAxios.get.mockResolvedValueOnce({
        data: { ethereum: { usd: 2000 } },
      });

      const result = await fetchSusdPrice();

      // Should still resolve via CoinGecko
      expect(result.source).toBe("coingecko-fallback");
    });
  });

  describe("CoinGecko fallback", () => {
    it("falls back to default $1.00 when both sources fail", async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error("Data Streams down"))
        .mockRejectedValueOnce(new Error("CoinGecko down"));

      const result = await fetchSusdPrice();

      expect(result.source).toBe("default");
      expect(result.price).toBe(1.0);
      expect(result.confidence).toBe("low");
    });

    it("falls back to default when CoinGecko returns malformed data", async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error("Data Streams down"))
        .mockResolvedValueOnce({ data: {} }); // no ethereum.usd field

      const result = await fetchSusdPrice();

      expect(result.source).toBe("default");
      expect(result.price).toBe(1.0);
      expect(result.confidence).toBe("low");
    });
  });

  describe("timestamp handling", () => {
    it("uses current timestamp when report omits observationsTimestamp", async () => {
      const price18 = BigInt(Math.round(1.0 * 1e18));
      const before  = Math.floor(Date.now() / 1000);

      mockedAxios.get.mockResolvedValueOnce({
        data: { report: { price: "0x" + price18.toString(16) } },
      });

      const result = await fetchSusdPrice();
      const after  = Math.floor(Date.now() / 1000);

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
