/**
 * index.ts — StableArb CRE Peg Monitor
 *
 * Main workflow entry-point.
 */

import { CronCapability, handler, Runner, type Runtime } from "@chainlink/cre-sdk";
import { fetchSusdPrice } from "./peg-monitor";
import { dispatchAction } from "./action-dispatcher";

export type Config = {
  schedule: string;
};

/**
 * Main callback function invoked by the trigger.
 */
export const onCronTrigger = (runtime: Runtime<Config>, _payload: any): string => {
  runtime.log("[stablearb-cre] Starting peg monitor run");

  // 1. Fetch price (Sync)
  const priceResult = fetchSusdPrice(runtime);
  runtime.log(`[stablearb-cre] Price: ${priceResult.price}`);

  // 2. Dispatch action (Sync)
  const decision = dispatchAction(runtime, priceResult);
  runtime.log(`[stablearb-cre] Action: ${decision.action}`);

  return JSON.stringify(decision, (_, v) => typeof v === "bigint" ? v.toString() : v);
};

/**
 * Initialization function for the workflow.
 */
export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

/**
 * Entry point for simulation and production runs.
 */
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
