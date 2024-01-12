// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {Position, Order, OrderType} from "../structs.sol";

interface ILiquidateVault {
    function validateLiquidationWithPosid(uint256 _posId) external view returns (bool, int256, int256, int256);
}