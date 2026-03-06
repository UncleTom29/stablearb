// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockVerifier {
    bytes public returnData;

    function setReturnData(bytes calldata data) external {
        returnData = data;
    }

    function verify(bytes calldata, bytes calldata)
        external
        payable
        returns (bytes memory)
    {
        return returnData;
    }

    function s_feeManager() external pure returns (address) {
        return address(0);
    }
}
