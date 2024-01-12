// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IVault {
    function accountDeltaIntoTotalUSD(bool _isIncrease, uint256 _delta) external;

    function distributeFee(uint256 _fee, address _refer, address _trader) external;

    function takeVUSDIn(address _account, uint256 _amount) external;

    function takeVUSDOut(address _account, uint256 _amount) external;

    function lastStakedAt(address _account) external view returns (uint256);

    function getVaultUSDBalance() external view returns (uint256);

    function getVLPPrice() external view returns (uint256);
}