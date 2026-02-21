# StableArb Demo Script

A step-by-step walkthrough of the full protocol for demo/judging purposes.

---

## 0. Pre-flight

1. Open MetaMask; switch to **Ethereum Sepolia**.
2. Confirm you hold:
   - ≥ 0.1 Sepolia ETH (for gas + collateral)
   - ≥ 5 Sepolia LINK (for Automation upkeep funding)
3. Open the StableArb frontend at `http://localhost:3000` (or the deployed URL).

---

## 1. Mint SUSD (2 minutes)

1. Click **"Connect Wallet"** in the top-right → approve MetaMask connection.
2. Navigate to **Mint SUSD** (`/mint`).
3. Choose collateral type: **ETH**.
4. Enter `0.05` ETH as collateral.
5. The UI shows the estimated max mintable (≈ $66 SUSD at $2,000/ETH with 150% ratio).
6. Enter `50` in the **SUSD to Mint** field.
7. Click **"Deposit & Mint"** → confirm in MetaMask.
8. Wait for confirmation; the green success banner and Etherscan link appear.

**What happened on-chain:**
- 0.05 ETH was transferred to `StableArbVault`.
- 50 SUSD was minted to your address.
- Collateral ratio = 200%.

---

## 2. Peg Dashboard (1 minute)

1. Navigate to **Dashboard** (`/dashboard`).
2. Observe:
   - **Peg Gauge** — shows SUSD at `$1.0000` (testnet default).
   - **24h Price Chart** — simulated price history around the peg.
   - **Total SUSD Supply** — includes the 50 SUSD you just minted.
   - **Collateral Ratio** — your position's ratio.

---

## 3. Trigger a Peg Defense Event (3 minutes)

### Option A — Chainlink Automation (on-chain)

1. Open the Automation dashboard: https://automation.chain.link/sepolia
2. Find the **StableArb PegDefender** upkeep.
3. The `checkUpkeep` function triggers a `StreamsLookup` → Automation DON fetches the Data Streams report.
4. If the price is outside the $0.995–$1.005 band, `performUpkeep` fires automatically.
5. Watch the **Incidents** page for a new event.

### Option B — CRE Workflow (off-chain trigger)

1. In a terminal:
   ```bash
   cd cre-workflow
   npm run dev
   ```
2. The workflow fetches the SUSD/USD price and (if outside the band) calls `performUpkeep` directly.
3. Output:
   ```
   [stablearb-cre] SUSD/USD price: $0.992000 (source: data-streams, confidence: high)
   [stablearb-cre] Action: BUYBACK — SUSD below peg ($0.9920) — buying back supply
   [stablearb-cre] Tx submitted: 0xabc...
   ```

---

## 4. Audit the Incident Log (1 minute)

1. Navigate to **Incidents** (`/incidents`).
2. The table shows the `PegDefenseTriggered` event:
   - **Action**: BUYBACK or MINT
   - **Price**: the verified Data Streams price at the time
   - **Amount**: SUSD burned/minted
   - **Tx**: link to Etherscan

---

## 5. Cross-Chain Buyback via CCIP (optional, 5 minutes)

1. Switch MetaMask to **Arbitrum Sepolia**.
2. In the browser console (or Remix), call:
   ```solidity
   CrossChainBuyback.sendAction(
     ActionType.BUYBACK,
     1000e18,      // 1,000 SUSD
     address(0),   // recipient (unused for BUYBACK)
     false         // pay fee in native ETH
   )
   ```
3. Monitor on https://ccip.chain.link — the message travels from Sepolia → Arbitrum Sepolia.
4. On arrival, `CrossChainBuyback.ccipReceive()` burns 1,000 SUSD from the Arbitrum treasury.

---

## Key Talking Points

| Feature | Chainlink Technology |
|---------|---------------------|
| Real-time price oracle | **Data Streams** (pull, DON-verified) |
| Automated peg defense | **Automation** (StreamsLookup upkeep) |
| Cross-chain buyback | **CCIP** |
| Collateral pricing | **Data Feeds** (push oracle fallback) |
| Off-chain monitoring | **CRE** TypeScript workflow |
| Cryptographic audit trail | On-chain `PegDefenseTriggered` events |
