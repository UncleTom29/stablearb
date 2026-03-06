/**
 * peg-monitor.ts
 * Fetches the current SUSD/USD price from DEX aggregator APIs.
 */

import { HTTPClient, type Runtime, type HTTPSendRequester, consensusMedianAggregation, ok, text } from "@chainlink/cre-sdk";

export interface PriceResult {
  price: number;
  source: string;
  timestamp: number;
  confidence: "high" | "medium" | "low";
}

const DATA_STREAMS_ENDPOINT = "https://api.testnet-dataengine.chain.link";
// Fallback feed if not specified in secrets: ETH/USD Sepolia
const DEFAULT_FEED = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";

/**
 * Worker function that runs on each node to fetch the price.
 */
const fetchPriceOnNode = (sendRequester: HTTPSendRequester, config: any, creds: { clientId: string, clientSecret: string, feedId: string }): number => {
  const authString = `${creds.clientId}:${creds.clientSecret}`;
  const b64Auth = Buffer.from(authString).toString("base64");

  const response = sendRequester.sendRequest({
    url: `${DATA_STREAMS_ENDPOINT}/api/v1/reports/latest?feedID=${creds.feedId}`,
    method: "GET",
    headers: { Authorization: `Basic ${b64Auth}` }
  }).result();

  if (!ok(response)) {
    throw new Error(`Data Streams HTTP failed: ${response.statusCode}`);
  }

  const data = JSON.parse(text(response));
  const report = data?.report;
  if (!report || !report.price) {
    throw new Error("No price in report body");
  }

  const rawPrice = BigInt(report.price);
  return Number(rawPrice) / 1e18;
}

/**
 * Main fetcher using consensus.
 * Reads configuration and secrets natively from the CRE Runtime.
 */
export function fetchSusdPrice(runtime: Runtime<any>): PriceResult {
  const httpClient = new HTTPClient();

  try {
    // Read credentials from secure vault
    const clientId = runtime.getSecret({ id: "DATA_STREAMS_CLIENT_ID" }).result().value;
    const clientSecret = runtime.getSecret({ id: "DATA_STREAMS_CLIENT_SECRET" }).result().value;

    // Attempt to get specific feed ID, fallback to stable default
    let feedId = DEFAULT_FEED;
    try {
      const secretFeed = runtime.getSecret({ id: "DATA_STREAMS_FEED_ID" }).result().value;
      if (secretFeed) feedId = secretFeed;
    } catch (e) { /* use default */ }

    const creds = { clientId, clientSecret, feedId };

    // Execute across the DON and aggregate results
    const price = httpClient.sendRequest(
      runtime,
      fetchPriceOnNode,
      consensusMedianAggregation<number>()
    )(runtime.config, creds).result();

    return {
      price,
      source: "data-streams",
      timestamp: Math.floor(Date.now() / 1000),
      confidence: "high",
    };
  } catch (err) {
    runtime.log(`[peg-monitor] Data Streams aggregation failed: ${(err as Error).message}`);
  }

  // Final fallback (should only occur if Data Streams are completely down or secrets missing)
  return {
    price: 1.0,
    source: "default",
    timestamp: Math.floor(Date.now() / 1000),
    confidence: "low",
  };
}
