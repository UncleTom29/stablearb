// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockFallbackFeed {
    int256  public price;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price     = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, block.timestamp, updatedAt, 1);
    }

    function setPrice(int256 _p) external {
        price     = _p;
        updatedAt = block.timestamp;
    }
}
