/**
 * data-streams-ws.test.ts
 * Unit tests for the WebSocket Data Streams client.
 */

import { EventEmitter } from "events";

// ── WebSocket mock ────────────────────────────────────────────────────────
// Must be declared before DataStreamsWsClient is imported so Jest hoisting works.

let mockLastInstance: MockWebSocket | null = null;

class MockWebSocket extends EventEmitter {
  public readonly url: string;
  public readonly options: Record<string, unknown>;
  public closed = false;

  constructor(url: string, options: Record<string, unknown> = {}) {
    super();
    this.url     = url;
    this.options = options;
    mockLastInstance = this;
  }

  close(): void {
    this.closed = true;
    this.emit("close");
  }
}

jest.mock("ws", () => ({
  __esModule: true,
  default: MockWebSocket,
}));

import { DataStreamsWsClient } from "../data-streams-ws";

// ── Tests ─────────────────────────────────────────────────────────────────

describe("DataStreamsWsClient", () => {
  const FEED_ID = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";

  beforeEach(() => {
    mockLastInstance = null;
    process.env.DATA_STREAMS_CLIENT_ID     = "test-id";
    process.env.DATA_STREAMS_CLIENT_SECRET = "test-secret";
    process.env.DATA_STREAMS_WS_ENDPOINT   = "wss://ws.test.chain.link";
  });

  afterEach(() => {
    delete process.env.DATA_STREAMS_CLIENT_ID;
    delete process.env.DATA_STREAMS_CLIENT_SECRET;
    delete process.env.DATA_STREAMS_WS_ENDPOINT;
  });

  it("throws when credentials are missing", async () => {
    delete process.env.DATA_STREAMS_CLIENT_ID;
    delete process.env.DATA_STREAMS_CLIENT_SECRET;

    const client = new DataStreamsWsClient([FEED_ID]);
    await expect(client.connect()).rejects.toThrow(
      /DATA_STREAMS_CLIENT_ID.*DATA_STREAMS_CLIENT_SECRET/
    );
  });

  it("emits 'open' event when socket connects", async () => {
    const client = new DataStreamsWsClient([FEED_ID]);
    const openPromise = new Promise<void>((resolve) => {
      client.on("open", resolve);
    });

    const connectPromise = client.connect();
    // Simulate open event from the WS server
    mockLastInstance!.emit("open");

    await Promise.all([connectPromise, openPromise]);
  });

  it("parses incoming report and emits PriceResult", async () => {
    const client = new DataStreamsWsClient([FEED_ID]);
    const reports: unknown[] = [];
    client.on("report", (r) => reports.push(r));

    const connectPromise = client.connect();
    mockLastInstance!.emit("open");
    await connectPromise;

    const price18 = BigInt(Math.round(0.998 * 1e18));
    const nowSec  = Math.floor(Date.now() / 1000);
    mockLastInstance!.emit(
      "message",
      JSON.stringify({
        report: {
          feedId:                FEED_ID,
          price:                 "0x" + price18.toString(16),
          observationsTimestamp: nowSec,
          bid:                   "0x0",
          ask:                   "0x0",
        },
      })
    );

    expect(reports).toHaveLength(1);
    const result = reports[0] as { price: number; source: string; confidence: string };
    expect(result.source).toBe("data-streams-ws");
    expect(result.confidence).toBe("high");
    expect(result.price).toBeCloseTo(0.998, 4);
  });

  it("emits 'error' on malformed JSON message", async () => {
    const client   = new DataStreamsWsClient([FEED_ID]);
    const errors: unknown[] = [];
    client.on("error", (e) => errors.push(e));

    const connectPromise = client.connect();
    mockLastInstance!.emit("open");
    await connectPromise;

    mockLastInstance!.emit("message", "not-valid-json{{{");

    expect(errors).toHaveLength(1);
  });

  it("includes feed IDs in WebSocket URL query params", async () => {
    const client = new DataStreamsWsClient([FEED_ID]);

    const connectPromise = client.connect();
    mockLastInstance!.emit("open");
    await connectPromise;

    expect(mockLastInstance!.url).toContain("feedIDs=");
    expect(mockLastInstance!.url).toContain(FEED_ID);
  });

  it("includes Authorization header with Base64-encoded credentials", async () => {
    const client = new DataStreamsWsClient([FEED_ID]);

    const connectPromise = client.connect();
    mockLastInstance!.emit("open");
    await connectPromise;

    const expected = `Basic ${Buffer.from("test-id:test-secret").toString("base64")}`;
    const opts = mockLastInstance!.options as { headers: Record<string, string> };
    expect(opts.headers.Authorization).toBe(expected);
  });

  it("closes socket without reconnecting when close() is called", async () => {
    const client = new DataStreamsWsClient([FEED_ID]);
    const connectPromise = client.connect();
    mockLastInstance!.emit("open");
    await connectPromise;

    client.close();

    // Wait a tick and verify no new socket was created
    await new Promise((r) => setTimeout(r, 50));
    expect(mockLastInstance!.closed).toBe(true);
  });
});
