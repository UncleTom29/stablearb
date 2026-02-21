# Chainlink Files — StableArb

This document describes every Chainlink integration used in the StableArb protocol.

---

## 1. Chainlink Data Streams (Pull Oracle)

**Used in:** `PegDefender.sol`, `cre-workflow/src/peg-monitor.ts`

| Property | Value |
|----------|-------|
| Network | Ethereum Sepolia (testnet) |
| Endpoint | `https://api.testnet-dataengine.chain.link` |
| WebSocket | `wss://ws.testnet-dataengine.chain.link` |
| ETH/USD Feed ID | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` |
| SUSD/USD Feed ID | Custom mock feed (deploy your own or use ETH/USD as proxy for testnet) |
| Verifier Proxy (Sepolia) | `0x09DFf56A4fF44e0f4436260A04F5CFa65636A481` |
| Report Schema | v3 `BasicReport` (see `PegDefender.sol::BasicReport`) |
| Fee Payment | Native ETH or LINK (via `IFeeManager`) |

### How it works

1. **`PegDefender.checkUpkeep`** triggers a `StreamsLookup` revert, instructing the Automation DON to fetch the latest Data Streams report off-chain.
2. The DON calls **`PegDefender.performUpkeep`** with the signed report as `performData`.
3. The contract calls `IVerifierProxy.verify()` to cryptographically verify the report on-chain.
4. The verified price is decoded from `BasicReport.price` (int192, 18 decimals).

### Relevant interfaces

- `contracts/src/interfaces/IVerifierProxy.sol` — `verify()` and `verifyBulk()`
- `contracts/src/interfaces/IFeeManager.sol` — `getFeeAndReward()`

---

## 2. Chainlink Data Feeds (Push Oracle — Fallback)

**Used in:** `StableArbVault.sol`, `PegDefender.sol`

| Feed | Address (Sepolia) | Decimals |
|------|-------------------|----------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 8 |
| WBTC/USD | `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43` | 8 |

- `StableArbVault` reads push feeds to calculate USD collateral value.
- `PegDefender` uses the ETH/USD feed as a fallback when Data Streams are unavailable.
- Both use `AggregatorV3Interface.latestRoundData()` with staleness checks.

---

## 3. Chainlink Automation (StreamsLookup Upkeep)

**Used in:** `PegDefender.sol`, `contracts/script/RegisterUpkeep.s.sol`

| Property | Value |
|----------|-------|
| Registry (Sepolia) | `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad` |
| Registrar (Sepolia v2.1) | `0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976` |
| Upkeep type | Conditional (time-based via `checkUpkeep` cooldown) |
| Trigger | `checkUpkeep` → `StreamsLookup` revert |
| Gas limit | 500,000 |
| Initial LINK funding | 5 LINK |

`PegDefender` implements both `AutomationCompatibleInterface` and `StreamsLookupCompatibleInterface`.

### Interfaces used

- `AutomationCompatibleInterface` — `checkUpkeep`, `performUpkeep`
- `StreamsLookupCompatibleInterface` — `checkErrorHandler`

---

## 4. Chainlink CCIP (Cross-Chain Interoperability Protocol)

**Used in:** `CrossChainBuyback.sol`

| Property | Value |
|----------|-------|
| Router (Sepolia) | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| Router (Arb Sepolia) | `0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165` |
| LINK (Sepolia) | `0x779877A7B0D9E8603169DdbD7836e478b4624789` |
| LINK (Arb Sepolia) | `0xb1D4538B4571d411F07960EF2838Ce337FE1E80E` |
| Arb Sepolia chain selector | `3478487238524512106` |
| Sepolia chain selector | `16015286601757825753` |
| Fee token | LINK or native ETH (caller's choice) |

### Message flow

```
Sepolia PegDefender
  └─► CrossChainBuyback.sendAction()
        └─► CCIPRouter.ccipSend()  →  CCIP  →  Arb Sepolia
                                                   └─► CrossChainBuyback.ccipReceive()
                                                         └─► SUSD.burn() / SUSD.mint()
```

### Interfaces used

- `IRouterClient` — `getFee()`, `ccipSend()`
- `IAny2EVMMessageReceiver` — `ccipReceive()`
- `Client.EVM2AnyMessage`, `Client.Any2EVMMessage`

---

## 5. CRE (Chainlink Runtime Environment)

**Used in:** `cre-workflow/`

| Property | Value |
|----------|-------|
| Dashboard | https://cre.chain.link |
| CLI docs | https://docs.chain.link/cre/getting-started/cli-installation |
| Trigger | Cron — every 5 minutes |
| Workflow entry | `cre-workflow/src/index.ts` |

The CRE workflow:

1. Calls the Data Streams REST API to fetch the latest SUSD/USD price.
2. Evaluates the price against the $0.995–$1.005 peg band.
3. If outside the band, encodes `performData` and calls `PegDefender.performUpkeep()` directly (as a fallback path in addition to the on-chain Automation trigger).
4. Writes a structured `IncidentReport` log.
