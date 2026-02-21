// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SUSD} from "../src/SUSD.sol";
import {StableArbVault} from "../src/StableArbVault.sol";
import {PegDefender} from "../src/PegDefender.sol";
import {CrossChainBuyback} from "../src/CrossChainBuyback.sol";

/// @notice Deploy the full StableArb stack to Ethereum Sepolia.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast \
///     --verify --etherscan-api-key $ETHERSCAN_API_KEY -vvvv
contract Deploy is Script {
    // ── Sepolia addresses ──────────────────────────────────────────────────
    address constant CCIP_ROUTER    = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    address constant LINK           = 0x779877A7B0D9E8603169DdbD7836e478b4624789;
    address constant WETH           = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    // Chainlink Data Feeds — Sepolia
    address constant ETH_USD_FEED   = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant WBTC_USD_FEED  = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;

    // Chainlink Data Streams — Sepolia verifier proxy
    address constant VERIFIER_PROXY = 0x09DFf56A4fF44e0f4436260A04F5CFa65636A481;

    // Data Streams feed IDs
    bytes32 constant ETH_USD_STREAM = 0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782;
    // SUSD/USD stream — use mock feed ID for testnet
    bytes32 constant SUSD_USD_STREAM = bytes32(uint256(keccak256("SUSD/USD")));

    // Automation registry
    address constant AUTOMATION_REGISTRY = 0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad;

    // Arbitrum Sepolia chain selector
    uint64 constant ARB_SEP_CHAIN_SEL = 3478487238524512106;

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        vm.startBroadcast(deployer);

        // 1. Deploy SUSD
        SUSD susd = new SUSD();
        console2.log("SUSD deployed at:", address(susd));

        // 2. Deploy Vault
        StableArbVault vault = new StableArbVault(address(susd));
        console2.log("StableArbVault deployed at:", address(vault));

        // 3. Authorise vault in SUSD
        susd.setVault(address(vault));
        console2.log("Vault authorised in SUSD");

        // 4. Register WETH as collateral (address(0) for native ETH)
        vault.addCollateralToken(address(0),  ETH_USD_FEED,  18); // native ETH
        vault.addCollateralToken(WETH,         ETH_USD_FEED,  18); // WETH
        console2.log("Collateral tokens registered");

        // 5. Deploy PegDefender
        PegDefender pegDefender = new PegDefender(
            VERIFIER_PROXY,
            address(susd),
            LINK,
            ETH_USD_FEED,    // fallback feed (ETH/USD as proxy for SUSD/USD on testnet)
            deployer,        // treasury = deployer for now
            SUSD_USD_STREAM,
            ETH_USD_STREAM
        );
        console2.log("PegDefender deployed at:", address(pegDefender));

        // 6. Deploy CrossChainBuyback (Sepolia sender)
        CrossChainBuyback buyback = new CrossChainBuyback(
            CCIP_ROUTER,
            LINK,
            address(susd)
        );
        console2.log("CrossChainBuyback deployed at:", address(buyback));

        // 7. Authorise PegDefender + CrossChainBuyback to mint/burn SUSD
        //    (done via vault — set vault to PegDefender for simplicity;
        //     in production use a multi-role access controller)
        // NOTE: This must match your access model.  Here we grant PegDefender
        //       the vault role so it can call susd.mint/burn directly.
        // susd.setVault(address(pegDefender)); // optional: hand off vault role

        vm.stopBroadcast();

        console2.log("=== Deployment summary ===");
        console2.log("SUSD            :", address(susd));
        console2.log("StableArbVault  :", address(vault));
        console2.log("PegDefender     :", address(pegDefender));
        console2.log("CrossChainBuyback:", address(buyback));
    }
}
