# 🎬 StableArb: Convergence Demo Script

This script provides a high-fidelity walkthrough for judges to verify the **StableArb** autonomous governor and multi-chain architecture.

---

## 🏗️ Phase 1: On-Chain Liquidity (2 mins)
**Objective**: Demonstrate real-world collateralized minting.

1.  **Connect**: Navigate to [StableArb DApp](http://localhost:3000) and connect via MetaMask (Sepolia).
2.  **Mint**: Go to the **Mint** page. Deposit **0.05 Sepolia ETH**.
3.  **Execute**: Mint **50 SUSD**. Observe the transaction.
    - *Talking Point*: "StableArb uses Chainlink Data Feeds to pull real-time ETH prices on-chain, ensuring every SUSD minted is backed by ≥150% collateral."

---

## 🤖 Phase 2: The Autonomous Governor (4 mins)
**Objective**: Trigger the CRE Peg Monitor and verify consensus.

### 2.1 Simulation Execution
In your terminal, simulate the DON executing the Governor logic:

```bash
cd cre-workflow
cre login
cre workflow simulate . --target production-settings --broadcast
```

### 2.2 Deep Dive into the Logs
Watch the output carefully:
1.  **"Fetching Price"**: The Governor pulls sub-second price logs from **Chainlink Data Streams**.
2.  **"BFT Aggregation"**: All simulated nodes reach consensus on the median price.
3.  **"Action Dispatch"**: If the peg deviates ($<0.995 or $>1.005), the DON generates a signed report.
4.  **"Tx Broadcast"**: Observe the **Sepolia Transaction Hash**.

### 2.3 On-Chain Verification
1.  Copy the `txHash` and paste into [Sepolia Etherscan](https://sepolia.etherscan.io).
2.  Observe the `onReport` call to `PegDefender.sol`.
3.  Verify the `PegDefenseTriggered` event.
    - *Talking Point*: "What you see here is the convergence of off-chain intelligence and on-chain proof. The Governor didn't just 'call a function'; the **Chainlink Keystone Forwarder** verified a BFT-consensus proof from the DON before execution."

---

## 🌐 Phase 3: Cross-Chain Parity (3 mins)
**Objective**: Demonstrate CCIP propagation.

1.  **Audit**: Navigate to the **Incidents** page on the DApp.
2.  **Verify CCIP**: Click the **CCIP Explorer** link next to the latest peg defense.
3.  **Cross-Chain Effect**: Switch MetaMask to **Arbitrum Sepolia**. Observe that the supply has been adjusted on the destination chain to maintain parity with the main liquidity vault.
    - *Talking Point*: "StableArb doesn't just defend one peg; it maintains a multi-chain standard using **Chainlink CCIP** to propagate local peg actions globally, preventing cross-chain arbitrage drains."

---

## 📊 Summary of Innovations

| Feature | The Convergence Edge |
|---------|-----------------------|
| **Latency** | Sub-second data pulls via **Data Streams**. |
| **Consensus** | All Governor logic is verified by a BFT DON (CRE). |
| **Trust** | Cryptographic proof delivery via **Keystone**. |
| **Reach** | Seamless supply parity via **CCIP**. |

---

**StableArb: Built for a Decentralized, Autonomous Future.**
