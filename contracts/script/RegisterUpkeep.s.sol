// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AutomationRegistrar2_1} from
    "@chainlink/contracts/src/v0.8/automation/AutomationRegistrar2_1.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Register a PegDefender contract as a Chainlink Automation upkeep.
///
/// Usage:
///   forge script script/RegisterUpkeep.s.sol --rpc-url $SEPOLIA_RPC --broadcast -vvvv
contract RegisterUpkeep is Script {
    address constant LINK             = 0x779877A7B0D9E8603169DdbD7836e478b4624789;
    address constant AUTOMATION_REGISTRY = 0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad;
    // Registrar address for Sepolia (v2.1)
    address constant AUTOMATION_REGISTRAR = 0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976;

    uint96  constant INITIAL_LINK_FUNDING = 5e18; // 5 LINK

    function run() external {
        address deployer    = vm.envAddress("DEPLOYER_ADDRESS");
        address pegDefender = vm.envAddress("PEG_DEFENDER_ADDRESS");

        vm.startBroadcast(deployer);

        IERC20 link = IERC20(LINK);

        // Approve registrar to spend LINK for initial funding
        link.approve(AUTOMATION_REGISTRAR, INITIAL_LINK_FUNDING);

        // Build the registration request
        AutomationRegistrar2_1.RegistrationParams memory params =
            AutomationRegistrar2_1.RegistrationParams({
                name:                 "StableArb PegDefender",
                encryptedEmail:       hex"",
                upkeepContract:       pegDefender,
                gasLimit:             500_000,
                adminAddress:         deployer,
                triggerType:          0,   // 0 = conditional (log trigger = 1)
                checkData:            hex"",
                triggerConfig:        hex"",
                offchainConfig:       hex"",
                amount:               INITIAL_LINK_FUNDING
            });

        uint256 upkeepId = AutomationRegistrar2_1(AUTOMATION_REGISTRAR).registerUpkeep(params);
        console2.log("Upkeep registered with ID:", upkeepId);

        vm.stopBroadcast();
    }
}
