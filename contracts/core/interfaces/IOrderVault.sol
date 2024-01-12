// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {Order, OrderType, OrderStatus, AddPositionOrder, DecreasePositionOrder, PositionTrigger} from "../structs.sol";

interface IOrderVault {
    function addTrailingStop(address _account, uint256 _posId, uint256[] memory _params) external;

    function addTriggerOrders(
        uint256 _posId,
        address _account,
        bool[] memory _isTPs,
        uint256[] memory _prices,
        uint256[] memory _amountPercents
    ) external;

    function cancelPendingOrder(address _account, uint256 _posId) external;

    function updateOrder(
        uint256 _posId,
        uint256 _positionType,
        uint256 _collateral,
        uint256 _size,
        OrderStatus _status
    ) external;

    function cancelMarketOrder(uint256 _posId) external;

    function createNewOrder(
        uint256 _posId,
        address _accout,
        bool _isLong,
        uint256 _tokenId,
        uint256 _positionType,
        uint256[] memory _params,
        address _refer
    ) external;

    function createAddPositionOrder(
        address _owner,
        uint256 _posId,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _allowedPrice,
        uint256 _fee
    ) external;

    function createDecreasePositionOrder(uint256 _posId, uint256 _sizeDelta, uint256 _allowedPrice) external;

    function cancelAddPositionOrder(uint256 _posId) external;

    function deleteAddPositionOrder(uint256 _posId) external;

    function deleteDecreasePositionOrder(uint256 _posId) external;

    function getOrder(uint256 _posId) external view returns (Order memory);

    function getAddPositionOrder(uint256 _posId) external view returns (AddPositionOrder memory);

    function getDecreasePositionOrder(uint256 _posId) external view returns (DecreasePositionOrder memory);

    function getTriggerOrderInfo(uint256 _posId) external view returns (PositionTrigger memory);

}