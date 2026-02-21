/**
 * app/api/peg-price/route.ts
 * Server-side DEX price aggregator — fetches SUSD/USD price.
 */

import { NextResponse } from "next/server";

const DATA_STREAMS_ENDPOINT =
  process.env.DATA_STREAMS_ENDPOINT ?? "https://api.testnet-dataengine.chain.link";
const ETH_USD_FEED =
  "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";

export async function GET() {
  // 1. Try Chainlink Data Streams
  try {
    const clientId     = process.env.DATA_STREAMS_CLIENT_ID;
    const clientSecret = process.env.DATA_STREAMS_CLIENT_SECRET;

    if (clientId && clientSecret) {
      const url = `${DATA_STREAMS_ENDPOINT}/api/v1/reports/latest?feedID=${ETH_USD_FEED}`;
      const creds   = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res     = await fetch(url, {
        headers:   { Authorization: `Basic ${creds}` },
        next:      { revalidate: 30 },
      });

      if (res.ok) {
        const json   = await res.json() as { report?: { price?: string; observationsTimestamp?: number } };
        const raw    = BigInt(json.report?.price ?? "0");
        const price  = Number(raw) / 1e18;

        if (price > 0) {
          return NextResponse.json({
            price,
            source:    "data-streams",
            timestamp: json.report?.observationsTimestamp ?? Math.floor(Date.now() / 1000),
          });
        }
      }
    }
  } catch {
    // fall through
  }

  // 2. Fallback — return $1.00 (testnet default, no liquid market for SUSD)
  return NextResponse.json({
    price:     1.0,
    source:    "default",
    timestamp: Math.floor(Date.now() / 1000),
  });
}
