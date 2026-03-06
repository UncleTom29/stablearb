# StableArb CRE Workflow

Chainlink CRE workflow for autonomous SUSD peg monitoring and on-chain action dispatch.

## What it does

- Triggers on a cron schedule (`src/config.json`)
- Fetches latest Data Streams report in `src/peg-monitor.ts`
- Reaches DON consensus on observed price
- Decides `BUYBACK`, `MINT`, or `NONE` in `src/action-dispatcher.ts`
- Submits signed report via `evmClient.writeReport`

## Structure

- `src/index.ts` — workflow entry + cron handler
- `src/peg-monitor.ts` — Data Streams fetch/aggregation logic
- `src/action-dispatcher.ts` — decision logic + EVM write call
- `src/incident-reporter.ts` — incident metadata helper
- `workflow.yaml` — staging/production workflow targets
- `project.yaml` — chain RPC target config
- `secrets.yaml` — required secret IDs

## Required secrets

Configure these in CRE secret management:

- `DATA_STREAMS_CLIENT_ID`
- `DATA_STREAMS_CLIENT_SECRET`
- `PEG_DEFENDER_ADDRESS`
- `CHAIN_ID`
- `DATA_STREAMS_FEED_ID`

## Local development

```bash
npm install
npm run build
```

## Simulate

```bash
cre login
cre workflow simulate . --target staging-settings
```

For production target dry-run:

```bash
cre workflow simulate . --target production-settings
```

## Broadcast mode (optional)

```bash
cre workflow simulate . --target production-settings --broadcast
```

Use broadcast only with production-ready secrets and funded execution accounts.
