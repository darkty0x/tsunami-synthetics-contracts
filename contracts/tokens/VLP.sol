// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./MintableBaseToken.sol";
import "../core/interfaces/IVault.sol";
import "../core/interfaces/ISettingsManager.sol";

contract VLP is MintableBaseToken {
    IVault public vault;
    ISettingsManager public settingsManager;

    constructor() MintableBaseToken("Vela LP", "VLP", 0) {}

    function initialize(address _vault, address _settingsManager) external onlyOwner {
        vault = IVault(_vault);
        settingsManager = ISettingsManager(_settingsManager);
    }

    function id() external pure returns (string memory _name) {
        return "VLP";
    }

    function transfer(address _recipient, uint256 _amount) public override returns (bool) {
        require(
            vault.lastStakedAt(msg.sender) + settingsManager.cooldownDuration() <= block.timestamp,
            "cooldown duration not yet passed"
        );
        return super.transfer(_recipient, _amount);
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) public override returns (bool) {
        if (!settingsManager.isWhitelistedFromTransferCooldown(_recipient)) {
            require(
                vault.lastStakedAt(_sender) + settingsManager.cooldownDuration() <= block.timestamp,
                "cooldown duration not yet passed"
            );
        }

        return super.transferFrom(_sender, _recipient, _amount);
    }
}