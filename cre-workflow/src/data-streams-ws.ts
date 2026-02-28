/**
 * data-streams-ws.ts
 * Real-time Chainlink Data Streams WebSocket client.
 * Streams live price reports for the SUSD/USD (and reference ETH/USD) feed IDs
 * using the authenticated WebSocket endpoint from the CRE configuration.
 *
 * The WebSocket interface mirrors the REST API but pushes new reports as soon
 * as the Chainlink DON publishes them (~1-second latency), making it ideal for
 * the on-chain peg-defense automation that needs the freshest possible price.
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import { type PriceResult } from "./peg-monitor";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StreamReport {
  feedId:                string;
  validFromTimestamp:    number;
  observationsTimestamp: number;
  price:                 string; // hex-encoded int192 (18 decimals)
  bid:                   string;
  ask:                   string;
}

export type DataStreamsEventMap = {
  report: [report: PriceResult];
  error:  [error: Error];
  close:  [];
  open:   [];
};

// ── Constants ─────────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS     = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY_MS = 60_000; // 60 seconds cap

// ── DataStreamsWsClient ────────────────────────────────────────────────────

/**
 * Connects to the Chainlink Data Streams WebSocket API and emits `report`
 * events whenever a new signed price report arrives for the subscribed feeds.
 *
 * Usage:
 * ```ts
 * const client = new DataStreamsWsClient(["0x0003...feedId"]);
 * client.on("report", (price) => console.log("Live SUSD price:", price));
 * await client.connect();
 * ```
 */
export class DataStreamsWsClient extends EventEmitter {
  private readonly feedIds:   string[];
  private readonly wsUrl:     string;
  private readonly clientId:  string;
  private readonly clientSecret: string;

  private ws:               WebSocket | null = null;
  private reconnectAttempts = 0;
  private closed            = false;

  constructor(feedIds: string[]) {
    super();
    this.feedIds      = feedIds;
    this.wsUrl        = process.env.DATA_STREAMS_WS_ENDPOINT ??
                        "wss://ws.testnet-dataengine.chain.link";
    this.clientId     = process.env.DATA_STREAMS_CLIENT_ID ?? "";
    this.clientSecret = process.env.DATA_STREAMS_CLIENT_SECRET ?? "";
  }

  // ── Public ───────────────────────────────────────────────────────────────

  /** Open the WebSocket connection.  Resolves when the socket is `open`. */
  async connect(): Promise<void> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "DATA_STREAMS_CLIENT_ID and DATA_STREAMS_CLIENT_SECRET must be set"
      );
    }

    return new Promise((resolve, reject) => {
      this._createSocket(resolve, reject);
    });
  }

  /** Gracefully close the connection without automatic reconnection. */
  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async _createSocket(
    onOpen?: () => void,
    onError?: (e: Error) => void
  ): Promise<void> {
    // Build the subscription URL with query params for feed IDs
    const url = new URL(this.wsUrl);
    this.feedIds.forEach((id) => url.searchParams.append("feedIDs", id));

    // HMAC-based auth header expected by the Data Streams WS endpoint
    const authHeader = `Basic ${Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64")}`;

    const socket = new WebSocket(url.toString(), {
      headers: { Authorization: authHeader },
    });

    this.ws = socket;

    socket.on("open", () => {
      this.reconnectAttempts = 0;
      this.emit("open");
      onOpen?.();
    });

    socket.on("message", (data: WebSocket.RawData) => {
      try {
        const payload = JSON.parse(data.toString()) as { report?: StreamReport };
        if (payload.report) {
          const priceResult = this._parseReport(payload.report);
          this.emit("report", priceResult);
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.on("error", (err: Error) => {
      this.emit("error", err);
      onError?.(err);
    });

    socket.on("close", () => {
      this.emit("close");
      if (!this.closed) {
        this._scheduleReconnect();
      }
    });
  }

  private _parseReport(report: StreamReport): PriceResult {
    const rawPrice = BigInt(report.price ?? "0x0");
    const price    = Number(rawPrice) / 1e18;
    return {
      price,
      source:    "data-streams-ws",
      timestamp: report.observationsTimestamp ?? Math.floor(Date.now() / 1000),
      confidence: "high",
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit(
        "error",
        new Error(
          `DataStreamsWsClient: max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`
        )
      );
      return;
    }

    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempts++;

    console.warn(
      `[data-streams-ws] Reconnecting in ${delay}ms ` +
        `(attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`
    );

    setTimeout(() => {
      if (!this.closed) {
        this._createSocket().catch((err: unknown) =>
          this.emit("error", err instanceof Error ? err : new Error(String(err)))
        );
      }
    }, delay);
  }
}
