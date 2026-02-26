// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract MockPriceFeed {
    int256  public price;
    uint80  public roundId = 1;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price     = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80  _roundId,
            int256  _answer,
            uint256 _startedAt,
            uint256 _updatedAt,
            uint80  _answeredInRound
        )
    {
        return (roundId, price, block.timestamp, updatedAt, roundId);
    }

    function setPrice(int256 _price) external {
        price     = _price;
        updatedAt = block.timestamp;
    }
}
