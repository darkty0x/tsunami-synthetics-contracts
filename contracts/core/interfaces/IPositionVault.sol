// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {Position, Order, OrderType, PaidFees} from "../structs.sol";

interface IPositionVault {
    function newPositionOrder(
        address _account,
        uint256 _tokenId,
        bool _isLong,
        OrderType _orderType,
        uint256[] memory _params,
        address _refer
    ) external;

    function addOrRemoveCollateral(address _account, uint256 _posId, bool isPlus, uint256 _amount) external;

    function createAddPositionOrder(
        address _account,
        uint256 _posId,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _allowedPrice
    ) external;

    function createDecreasePositionOrder(
        uint256 _posId,
        address _account,
        uint256 _sizeDelta,
        uint256 _allowedPrice
    ) external;

    function increasePosition(
        uint256 _posId,
        address _account,
        uint256 _tokenId,
        bool _isLong,
        uint256 _price,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _fee
    ) external;

    function decreasePosition(uint256 _posId, uint256 _price, uint256 _sizeDelta) external;

    function decreasePositionByOrderVault(uint256 _posId, uint256 _price, uint256 _sizeDelta) external;

    function removeUserAlivePosition(address _user, uint256 _posId) external;

    function removeUserOpenOrder(address _user, uint256 _posId) external;

    function lastPosId() external view returns (uint256);

    function getPosition(uint256 _posId) external view returns (Position memory);

    function getUserPositionIds(address _account) external view returns (uint256[] memory);

    function getUserOpenOrderIds(address _account) external view returns (uint256[] memory);

    function getPaidFees(uint256 _posId) external view returns (PaidFees memory);

    function getVaultUSDBalance() external view returns (uint256);
}