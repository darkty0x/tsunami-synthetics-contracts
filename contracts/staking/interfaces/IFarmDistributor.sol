// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IFarmDistributor {
    function deposit(uint256 _pid, uint256 _amount) external;

    function poolLength() external view returns (uint256);

    function poolTotalLp(uint256 pid) external view returns (uint256);
}