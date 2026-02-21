// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SUSD} from "../src/SUSD.sol";
import {CrossChainBuyback} from "../src/CrossChainBuyback.sol";

/// @notice Deploy the CrossChainBuyback receiver to Arbitrum Sepolia.
///
/// Usage:
///   forge script script/DeployArbitrum.s.sol --rpc-url $ARB_SEPOLIA_RPC --broadcast \
///     --verify --etherscan-api-key $ARBISCAN_API_KEY -vvvv
contract DeployArbitrum is Script {
    // ── Arbitrum Sepolia addresses ────────────────────────────────────────
    address constant CCIP_ROUTER_ARB = 0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165;
    address constant LINK_ARB        = 0xb1D4538B4571d411F07960EF2838Ce337FE1E80E;

    // Sepolia chain selector (source)
    uint64 constant SEPOLIA_CHAIN_SEL = 16015286601757825753;

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        // Address of the CrossChainBuyback deployed on Sepolia (must be set)
        address sepoliaBuyback = vm.envAddress("SEPOLIA_BUYBACK_ADDRESS");

        vm.startBroadcast(deployer);

        // 1. Deploy SUSD mirror on Arbitrum Sepolia
        SUSD susdArb = new SUSD();
        console2.log("SUSD (Arb Sepolia) deployed at:", address(susdArb));

        // 2. Deploy CrossChainBuyback receiver on Arbitrum Sepolia
        CrossChainBuyback receiver = new CrossChainBuyback(
            CCIP_ROUTER_ARB,
            LINK_ARB,
            address(susdArb)
        );
        console2.log("CrossChainBuyback (Arb receiver) deployed at:", address(receiver));

        // 3. Authorise Sepolia sender
        receiver.setAllowedSource(SEPOLIA_CHAIN_SEL, sepoliaBuyback);
        console2.log("Allowed source set: Sepolia", sepoliaBuyback);

        // 4. Authorise receiver as vault in SUSD (so it can mint/burn)
        susdArb.setVault(address(receiver));
        console2.log("Receiver authorised as vault in SUSD (Arb)");

        vm.stopBroadcast();

        console2.log("=== Arbitrum Sepolia deployment summary ===");
        console2.log("SUSD (Arb)        :", address(susdArb));
        console2.log("CrossChainBuyback :", address(receiver));
    }
}
