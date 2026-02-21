// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SUSD — StableArb USD stablecoin
/// @notice ERC-20 token mintable/burnable exclusively by the authorized Vault contract.
contract SUSD is ERC20, Ownable {
    /// @notice The vault address that is authorised to mint and burn.
    address public vault;

    error OnlyVault();
    error ZeroAddress();

    event VaultSet(address indexed newVault);

    constructor() ERC20("StableArb USD", "SUSD") Ownable(msg.sender) {}

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    /// @notice Set (or replace) the authorised vault address.
    /// @param _vault The new vault address.
    function setVault(address _vault) external onlyOwner {
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
        emit VaultSet(_vault);
    }

    /// @notice Mint SUSD to `to`.
    /// @param to   Recipient address.
    /// @param amount Amount in 18-decimal units.
    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    /// @notice Burn `amount` SUSD from `from`.
    /// @param from   Address to burn from (must have approved vault or vault == from).
    /// @param amount Amount in 18-decimal units.
    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
