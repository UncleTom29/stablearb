# StableArb

> A Chainlink-powered stablecoin protocol where CRE + Data Streams autonomously defend the SUSD $1.00 peg across chains.

## Architecture

```
stableArb/
├── contracts/          # Foundry Solidity project
│   ├── src/
│   │   ├── SUSD.sol                 ERC-20 stablecoin (mintable/burnable by Vault)
│   │   ├── StableArbVault.sol       Core vault: collateral → SUSD mint/burn
│   │   ├── PegDefender.sol          Automation upkeep: Data Streams + peg defense
│   │   ├── CrossChainBuyback.sol    CCIP receiver/sender: cross-chain buybacks
│   │   └── interfaces/
│   │       ├── IVerifierProxy.sol   Chainlink Data Streams verifier
│   │       └── IFeeManager.sol      Data Streams fee manager
│   ├── script/
│   │   ├── Deploy.s.sol             Deploy to Ethereum Sepolia
│   │   ├── DeployArbitrum.s.sol     Deploy to Arbitrum Sepolia
│   │   └── RegisterUpkeep.s.sol     Register Chainlink Automation upkeep
│   └── test/
│       ├── StableArbVault.t.sol
│       ├── PegDefender.t.sol
│       └── CrossChainBuyback.t.sol
│
├── cre-workflow/       # CRE TypeScript peg monitor
│   ├── src/
│   │   ├── index.ts                 Main entry (cron trigger)
│   │   ├── peg-monitor.ts           Fetch SUSD price
│   │   ├── action-dispatcher.ts     Decide & execute peg defense
│   │   └── incident-reporter.ts     Write incident report on-chain
│   ├── cre.toml
│   └── package.json
│
├── frontend/           # Next.js 14 App Router dApp
│   └── src/
│       ├── app/
│       │   ├── page.tsx             Landing page
│       │   ├── mint/page.tsx        Deposit & mint SUSD
│       │   ├── dashboard/page.tsx   Live peg health dashboard
│       │   ├── incidents/page.tsx   Peg defense audit log
│       │   └── api/
│       │       ├── peg-price/       Server-side price aggregator
│       │       └── incidents/       On-chain incident log fetcher
│       ├── components/
│       └── lib/
│
└── docs/
    ├── README.md         (this file)
    ├── CHAINLINK_FILES.md
    └── demo-script.md
```

## Quick Start

### Prerequisites

- Node.js v20+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- CRE CLI (see https://docs.chain.link/cre/getting-started/cli-installation)
- MetaMask with Sepolia + Arbitrum Sepolia ETH/LINK

### 1. Install dependencies

```bash
# Contracts
cd contracts && forge install

# CRE workflow
cd cre-workflow && npm install

# Frontend
cd frontend && npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` in each sub-project and fill in:

```
DEPLOYER_ADDRESS=0x...
DEPLOYER_PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://...
ARB_SEPOLIA_RPC_URL=https://...
ETHERSCAN_API_KEY=...
ARBISCAN_API_KEY=...
DATA_STREAMS_CLIENT_ID=...
DATA_STREAMS_CLIENT_SECRET=...
```

### 3. Deploy contracts

```bash
# Ethereum Sepolia
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY -vvvv

# Arbitrum Sepolia
SEPOLIA_BUYBACK_ADDRESS=0x... \
forge script script/DeployArbitrum.s.sol \
  --rpc-url $ARB_SEPOLIA_RPC_URL \
  --broadcast --verify \
  --etherscan-api-key $ARBISCAN_API_KEY -vvvv

# Register Automation upkeep
PEG_DEFENDER_ADDRESS=0x... \
forge script script/RegisterUpkeep.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast -vvvv
```

### 4. Run contract tests

```bash
cd contracts && forge test -vv
```

### 5. Run CRE workflow locally

```bash
cd cre-workflow
cp .env.example .env  # fill in values
npm run dev
```

### 6. Start the frontend

```bash
cd frontend
cp .env.local.example .env.local  # fill in contract addresses
npm run dev
# Open http://localhost:3000
```

## Testnet Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| CCIP Router | Sepolia | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| LINK Token | Sepolia | `0x779877A7B0D9E8603169DdbD7836e478b4624789` |
| WETH | Sepolia | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |
| Automation Registry | Sepolia | `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad` |
| CCIP Router | Arb Sepolia | `0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165` |
| LINK Token | Arb Sepolia | `0xb1D4538B4571d411F07960EF2838Ce337FE1E80E` |

## Peg Defense Logic

| Condition | Action |
|-----------|--------|
| SUSD < $0.995 | **BUYBACK** — burn SUSD from treasury to reduce supply |
| SUSD > $1.005 | **MINT** — mint SUSD to treasury to increase supply |
| $0.995 ≤ SUSD ≤ $1.005 | No action |

The defense amount scales proportionally to the deviation from the $1.00 target, capped at `maxActionAmount` (default: 10,000 SUSD).

## Security

- Vault enforces 150% minimum collateral ratio
- Liquidation triggers at 120% ratio (10% bonus for liquidators)
- Only the authorised vault address can mint/burn SUSD
- CCIP receiver validates source chain selector + sender address
- Data Streams reports are cryptographically verified by the Chainlink DON before any action

## License

MIT
