// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title IFeeManager — Chainlink Data Streams fee manager interface
interface IFeeManager {
    struct Quote {
        address quoteAddress; // Token used to pay the fee (native or LINK).
    }

    /// @notice Returns the fee required to verify the given signed report.
    /// @param subscriber  The address that will pay the fee (usually address(this)).
    /// @param unverifiedReport The raw signed report bytes.
    /// @param quoteAddress     The token in which the caller wants to pay fees.
    /// @return feeAndReward    The asset + amount struct representing the required fee.
    /// @return discount        Any discount applied to the fee.
    /// @return expiresAt       Timestamp after which the report can no longer be verified.
    function getFeeAndReward(
        address subscriber,
        bytes calldata unverifiedReport,
        address quoteAddress
    )
        external
        view
        returns (
            IFeeManager.Quote memory feeAndReward,
            uint256 discount,
            uint32 expiresAt
        );

    /// @notice Returns the LINK token address used for fee payments.
    function i_linkAddress() external view returns (address);

    /// @notice Returns the native wrapped token address used for fee payments.
    function i_nativeAddress() external view returns (address);

    /// @notice Returns the reward manager contract address.
    function i_rewardManager() external view returns (address);
}
