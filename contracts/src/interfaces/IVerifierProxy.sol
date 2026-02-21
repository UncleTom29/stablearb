// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title IVerifierProxy — Chainlink Data Streams verifier interface
interface IVerifierProxy {
    /// @notice Verifies a signed report returned by a Chainlink Data Streams DON.
    /// @param signedReport The full signed report bytes (including schema, body, and signature).
    /// @param parameterPayload  ABI-encoded extra params passed through to the fee manager.
    /// @return verifierResponse ABI-decoded, verified report bytes (the inner Report struct).
    function verify(
        bytes calldata signedReport,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory verifierResponse);

    /// @notice Bulk-verify multiple signed reports in a single call.
    /// @param signedReports Array of signed report byte arrays.
    /// @param parameterPayload ABI-encoded extra params.
    /// @return verifiedReports Array of verified report byte arrays.
    function verifyBulk(
        bytes[] calldata signedReports,
        bytes calldata parameterPayload
    ) external payable returns (bytes[] memory verifiedReports);

    /// @notice Returns the fee manager contract address used by this proxy.
    function s_feeManager() external view returns (address);
}
