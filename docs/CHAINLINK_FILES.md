# Chainlink Files — StableArb

This document describes every Chainlink integration used in the StableArb protocol.

---

## 1. Chainlink Data Streams (Pull Oracle)

**Used in:** `cre-workflow/src/peg-monitor.ts`

| Property | Value |
|----------|-------|
| Network | Ethereum Sepolia (testnet) |
| Endpoint | `https://api.testnet-dataengine.chain.link` |
| ETH/USD Feed ID | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` |
| Access | Secure via `CRE HTTPClient` with signed secrets |

### How it works

1. The **CRE Workflow** executes as a WASM binary on the Chainlink Decentralized Oracle Network.
2. It uses the `HTTPClient` to perform an authenticated GET request to the Data Streams REST API.
3. Every node in the DON fetches the price and achieves BFT consensus on the median value.
4. This consensus-verified price is then used to decide if peg-defense is required.

---

## 2. Chainlink CRE (Chainlink Runtime Environment)

**Used in:** `cre-workflow/` (Core Governor)

| Property | Value |
|----------|-------|
| Trigger | Cron — every 5 minutes (Native CRE schedule) |
| Language | TypeScript (compiled to WASM) |
| On-Chain Write | `evmClient.writeReport()` |
| Forwarder | `KeystoneForwarder` |

The CRE workflow acts as the "Autonomous Governor" of the protocol:

1. **Trigger**: Every 5 minutes, the `CronCapability` fires the `onCronTrigger` handler.
2. **Logic**: Pulls the SUSD price (Data Streams) and calculates the required supply adjustment.
3. **Consensus**: All nodes in the DON must agree on the price observation and the resulting action.
4. **EVM Write**: The DON signs a report containing `(price, actionType, amount)` and submits it to the `PegDefender` contract via the **Keystone Forwarder**.

---

## 3. Chainlink Keystone Forwarder (EVM Write)

**Used in:** `PegDefender.sol` (Consumer)

Instead of traditional Automation-triggered transactions, StableArb uses the **Keystone Forwarder** pattern:

1. **Verification**: The Forwarder contract verifies the multi-signatures of the CRE DON on-chain.
2. **Callback**: Once verified, the Forwarder calls `PegDefender.onReport()`.
3. **Access Control**: `PegDefender` enforces that only the trusted Forwarder address can call this function, ensuring that no malicious actor can spoof peg-defense actions.

---

## 4. Chainlink Data Feeds (Push Oracle — Fallback)

**Used in:** `StableArbVault.sol`

| Feed | Address (Sepolia) | Decimals |
|------|-------------------|----------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 8 |

- `StableArbVault` reads push feeds to calculate USD collateral value for minting SUSD.
- Uses `AggregatorV3Interface.latestRoundData()` with staleness checks.

---

## 5. Chainlink CCIP (Cross-Chain Interoperability Protocol)

**Used in:** `CrossChainBuyback.sol`

| Property | Value |
|----------|-------|
| Router (Sepolia) | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| Router (Arb Sepolia) | `0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165` |
| Arb Sepolia chain selector | `3478487238524512106` |
| Sepolia chain selector | `16015286601757825753` |

### Message flow

```
Sepolia PegDefender
  └─► CrossChainBuyback.sendAction()
        └─► CCIPRouter.ccipSend()  →  CCIP  →  Arb Sepolia
                                                    └─► CrossChainBuyback.ccipReceive()
                                                          └─► SUSD.burn() / SUSD.mint()
```
