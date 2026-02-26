// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IAny2EVMMessageReceiver} from "@chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol";

contract MockCCIPRouter {
    bytes32 public lastMessageId = keccak256("mockMessageId");
    uint256 public feeAmount = 1e15;

    function getFee(uint64, Client.EVM2AnyMessage calldata) external view returns (uint256) {
        return feeAmount;
    }

    function ccipSend(uint64, Client.EVM2AnyMessage calldata) external payable returns (bytes32) {
        return lastMessageId;
    }

    function setFee(uint256 _fee) external {
        feeAmount = _fee;
    }

    /// @notice Helper to simulate CCIP router calling ccipReceive on a contract.
    function simulateCcipReceive(address target, Client.Any2EVMMessage calldata message) external {
        IAny2EVMMessageReceiver(target).ccipReceive(message);
    }
}
