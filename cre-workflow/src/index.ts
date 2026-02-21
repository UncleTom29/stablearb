/**
 * index.ts — StableArb CRE Peg Monitor
 *
 * Main workflow entry-point.  Designed to be triggered every 5 minutes by the
 * CRE cron scheduler (see cre.toml).
 *
 * Flow:
 *   1. Fetch current SUSD/USD price (Data Streams → CoinGecko fallback)
 *   2. Decide and execute peg-defense action if price is outside the $0.995–$1.005 band
 *   3. Report the incident on-chain for auditability
 */

import "dotenv/config";
import { fetchSusdPrice }    from "./peg-monitor";
import { dispatchAction }    from "./action-dispatcher";
import { reportIncident }    from "./incident-reporter";

async function main(): Promise<void> {
  console.info("[stablearb-cre] Starting peg monitor run at", new Date().toISOString());

  // 1. Fetch price
  const priceResult = await fetchSusdPrice();
  console.info(
    `[stablearb-cre] SUSD/USD price: $${priceResult.price.toFixed(6)} ` +
    `(source: ${priceResult.source}, confidence: ${priceResult.confidence})`
  );

  // 2. Dispatch action
  const decision = await dispatchAction(priceResult);
  console.info(`[stablearb-cre] Action: ${decision.action} — ${decision.reason}`);

  // 3. Report incident
  await reportIncident(decision);

  console.info("[stablearb-cre] Run complete.");
}

main().catch((err) => {
  console.error("[stablearb-cre] Fatal error:", err);
  process.exit(1);
});
