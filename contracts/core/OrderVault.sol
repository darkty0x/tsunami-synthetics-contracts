// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "./interfaces/IOrderVault.sol";
import "./interfaces/IPositionVault.sol";
import "./interfaces/IPriceManager.sol";
import "./interfaces/ISettingsManager.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IOperators.sol";

import {Constants} from "../access/Constants.sol";
import {OrderStatus, TriggerInfo, TriggerStatus, PositionTrigger, AddPositionOrder, DecreasePositionOrder} from "./structs.sol";

contract OrderVault is Constants, Initializable, ReentrancyGuardUpgradeable, IOrderVault {
    // constants
    IPriceManager private priceManager;
    IPositionVault private positionVault;
    ISettingsManager private settingsManager;
    IVault private vault;
    IOperators private operators;
    bool private isInitialized;

    // variables
    mapping(uint256 => Order) public orders;
    mapping(uint256 => AddPositionOrder) public addPositionOrders;
    mapping(uint256 => DecreasePositionOrder) public decreasePositionOrders;

    mapping(uint256 => PositionTrigger) private triggerOrders;
    mapping(uint256 => EnumerableSetUpgradeable.UintSet) private aliveTriggerIds;

    event NewOrder(
        uint256 posId,
        address account,
        bool isLong,
        uint256 tokenId,
        uint256 positionType,
        OrderStatus orderStatus,
        uint256[] triggerData,
        address refer
    );
    event UpdateOrder(uint256 posId, uint256 positionType, OrderStatus orderStatus);
    event FinishOrder(uint256 posId, uint256 positionType, OrderStatus orderStatus);

    event AddTriggerOrders(
        uint256 posId,
        uint256 orderId,
        bool isTP,
        uint256 price,
        uint256 amountPercent,
        TriggerStatus status
    );
    event EditTriggerOrder(uint256 indexed posId, uint256 orderId, bool isTP, uint256 price, uint256 amountPercent);
    event ExecuteTriggerOrders(uint256 posId, uint256 amount, uint256 orderId, uint256 price);
    event UpdateTriggerOrderStatus(uint256 posId, uint256 orderId, TriggerStatus status);

    event AddTrailingStop(uint256 posId, uint256[] data);
    event UpdateTrailingStop(uint256 posId, uint256 stpPrice);

    modifier onlyVault() {
        require(msg.sender == address(vault), "Only vault");
        _;
    }

    modifier onlyPositionVault() {
        require(msg.sender == address(positionVault), "Only position vault");
        _;
    }

    modifier onlyOperator(uint256 level) {
        require(operators.getOperatorLevel(msg.sender) >= level, "invalid operator");
        _;
    }

    /* ========== INITIALIZE FUNCTIONS ========== */

    function initialize() public initializer {
        __ReentrancyGuard_init();
    }

    function init(
        IPriceManager _priceManager,
        IPositionVault _positionVault,
        ISettingsManager _settingsManager,
        IVault _vault,
        IOperators _operators
    ) external {
        require(!isInitialized, "initialized");
        require(AddressUpgradeable.isContract(address(_priceManager)), "priceManager invalid");
        require(AddressUpgradeable.isContract(address(_positionVault)), "positionVault invalid");
        require(AddressUpgradeable.isContract(address(_settingsManager)), "settingsManager invalid");
        require(AddressUpgradeable.isContract(address(_vault)), "vault invalid");
        require(AddressUpgradeable.isContract(address(_operators)), "operators is invalid");

        priceManager = _priceManager;
        settingsManager = _settingsManager;
        positionVault = _positionVault;
        vault = _vault;
        operators = _operators;

        isInitialized = true;
    }

    /* ========== FOR OPENING POSITIONS ========== */

    function createNewOrder(
        uint256 _posId,
        address _account,
        bool _isLong,
        uint256 _tokenId,
        uint256 _positionType,
        uint256[] memory _params,
        address _refer
    ) external override onlyPositionVault {
        Order storage order = orders[_posId];
        order.status = OrderStatus.PENDING;
        order.positionType = _positionType;
        order.collateral = _params[2];
        order.size = _params[3];
        order.lmtPrice = _params[0];
        order.stpPrice = _params[1];
        order.timestamp = block.timestamp;
        emit NewOrder(_posId, _account, _isLong, _tokenId, order.positionType, order.status, _params, _refer);
    }

    function cancelMarketOrder(uint256 _posId) public override onlyPositionVault {
        // only cancel if the order still exists
        if (orders[_posId].size > 0) {
            Order storage order = orders[_posId];
            order.status = OrderStatus.CANCELED;

            Position memory position = positionVault.getPosition(_posId);
            vault.takeVUSDOut(position.owner, order.collateral + positionVault.getPaidFees(_posId).paidPositionFee);

            emit FinishOrder(_posId, order.positionType, order.status);
        }
    }

    function cancelPendingOrder(address _account, uint256 _posId) external override onlyVault {
        Order storage order = orders[_posId];
        Position memory position = positionVault.getPosition(_posId);
        require(_account == position.owner, "You are not allowed to cancel");
        require(order.status == OrderStatus.PENDING, "Not in Pending");
        require(order.positionType != POSITION_MARKET, "market order cannot be cancelled");
        if (order.positionType == POSITION_TRAILING_STOP) {
            order.status = OrderStatus.FILLED;
            order.positionType = POSITION_MARKET;
        } else {
            order.status = OrderStatus.CANCELED;
            vault.takeVUSDOut(position.owner, order.collateral + positionVault.getPaidFees(_posId).paidPositionFee);
        }
        order.collateral = 0;
        order.size = 0;
        order.lmtPrice = 0;
        order.stpPrice = 0;
        emit FinishOrder(_posId, order.positionType, order.status);
    }

    function updateOrder(
        uint256 _posId,
        uint256 _positionType,
        uint256 _collateral,
        uint256 _size,
        OrderStatus _status
    ) public override onlyPositionVault {
        _updateOrder(_posId, _positionType, _collateral, _size, _status);
    }

    function _updateOrder(
        uint256 _posId,
        uint256 _positionType,
        uint256 _collateral,
        uint256 _size,
        OrderStatus _status
    ) private {
        Order storage order = orders[_posId];
        order.positionType = _positionType;
        order.collateral = _collateral;
        order.size = _size;
        order.status = _status;
        if (_status == OrderStatus.FILLED || _status == OrderStatus.CANCELED) {
            emit FinishOrder(_posId, _positionType, _status);
        } else {
            emit UpdateOrder(_posId, _positionType, _status);
        }
    }

    /* ========== FOR ADDING POSITIONS ========== */

    function createAddPositionOrder(
        address _owner,
        uint256 _posId,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _allowedPrice,
        uint256 _fee
    ) external override onlyPositionVault {
        require(addPositionOrders[_posId].size == 0, "addPositionOrder already exists");

        addPositionOrders[_posId] = AddPositionOrder({
            owner: _owner,
            collateral: _collateralDelta,
            size: _sizeDelta,
            allowedPrice: _allowedPrice,
            timestamp: block.timestamp,
            fee: _fee
        });
    }

    function cancelAddPositionOrder(uint256 _posId) external override onlyPositionVault {
        AddPositionOrder memory addPositionOrder = addPositionOrders[_posId];

        if (addPositionOrder.size > 0) {
            vault.takeVUSDOut(addPositionOrder.owner, addPositionOrder.collateral + addPositionOrder.fee);
            delete addPositionOrders[_posId];
        }
    }

    function deleteAddPositionOrder(uint256 _posId) external override onlyPositionVault {
        delete addPositionOrders[_posId];
    }

    /* ========== FOR CLOSING POSITIONS (MARKET ORDER) ========== */

    function createDecreasePositionOrder(
        uint256 _posId,
        uint256 _sizeDelta,
        uint256 _allowedPrice
    ) external override onlyPositionVault {
        require(decreasePositionOrders[_posId].size == 0, "decreasePositionOrder already exists");

        decreasePositionOrders[_posId] = DecreasePositionOrder({
            size: _sizeDelta,
            allowedPrice: _allowedPrice,
            timestamp: block.timestamp
        });
    }

    function deleteDecreasePositionOrder(uint256 _posId) external override onlyPositionVault {
        delete decreasePositionOrders[_posId];
    }

    /* ========== FOR CLOSING POSITIONS (TPSL ORDER) ========== */

    function addTriggerOrders(
        uint256 _posId,
        address _account,
        bool[] memory _isTPs,
        uint256[] memory _prices,
        uint256[] memory _amountPercents
    ) external override onlyVault {
        Position memory position = positionVault.getPosition(_posId);
        require(position.owner == _account, "not allowed");
        require(_prices.length == _isTPs.length && _prices.length == _amountPercents.length, "invalid params");
        require(_prices.length > 0, "empty order");
        require(
            EnumerableSetUpgradeable.length(aliveTriggerIds[_posId]) + _prices.length <=
                settingsManager.maxTriggerPerPosition(),
            "too many triggers"
        );
        PositionTrigger storage triggerOrder = triggerOrders[_posId];

        for (uint256 i; i < _prices.length; ++i) {
            require(_amountPercents[i] > 0 && _amountPercents[i] <= BASIS_POINTS_DIVISOR, "invalid percent");

            uint256 triggersLength = triggerOrder.triggers.length;
            EnumerableSetUpgradeable.add(aliveTriggerIds[_posId], triggersLength);
            triggerOrder.triggers.push(
                TriggerInfo({
                    isTP: _isTPs[i],
                    amountPercent: _amountPercents[i],
                    createdAt: block.timestamp,
                    price: _prices[i],
                    triggeredAmount: 0,
                    triggeredAt: 0,
                    status: TriggerStatus.OPEN
                })
            );
            emit AddTriggerOrders(
                _posId,
                triggersLength,
                _isTPs[i],
                _prices[i],
                _amountPercents[i],
                TriggerStatus.OPEN
            );
        }
    }

    function cancelTriggerOrder(uint256 _posId, uint256 _orderId) external nonReentrant {
        _cancelTriggerOrder(_posId, _orderId);
    }

    function cancelTriggerOrderPacked(uint256 x) external nonReentrant {
        uint256 posId = x / 2 ** 128;
        uint256 orderId = x % 2 ** 128;
        _cancelTriggerOrder(posId, orderId);
    }

    function _cancelTriggerOrder(uint256 _posId, uint256 _orderId) private {
        PositionTrigger storage order = triggerOrders[_posId];
        Position memory position = positionVault.getPosition(_posId);
        require(position.owner == msg.sender, "not allowed");
        require(order.triggers[_orderId].status == TriggerStatus.OPEN, "TriggerOrder was cancelled");
        order.triggers[_orderId].status = TriggerStatus.CANCELLED;
        EnumerableSetUpgradeable.remove(aliveTriggerIds[_posId], _orderId);
        emit UpdateTriggerOrderStatus(_posId, _orderId, order.triggers[_orderId].status);
    }

    function cancelAllTriggerOrders(uint256 _posId) external nonReentrant {
        PositionTrigger storage order = triggerOrders[_posId];
        Position memory position = positionVault.getPosition(_posId);
        require(position.owner == msg.sender, "not allowed");
        uint256 length = EnumerableSetUpgradeable.length(aliveTriggerIds[_posId]);
        require(length > 0, "already cancelled");
        uint256[] memory tmp = new uint256[](length);
        for (uint256 i = 0; i < length; ++i) {
            uint256 idx = EnumerableSetUpgradeable.at(aliveTriggerIds[_posId], i);
            TriggerInfo storage trigger = order.triggers[idx];
            trigger.status = TriggerStatus.CANCELLED;
            emit UpdateTriggerOrderStatus(_posId, idx, trigger.status);
            tmp[i] = idx;
        }
        for (uint256 i = 0; i < length; ++i) {
            EnumerableSetUpgradeable.remove(aliveTriggerIds[_posId], tmp[i]);
        }
    }

    function editTriggerOrder(
        uint256 _posId,
        uint256 _orderId,
        bool _isTP,
        uint256 _price,
        uint256 _amountPercent
    ) external nonReentrant {
        PositionTrigger storage order = triggerOrders[_posId];
        Position memory position = positionVault.getPosition(_posId);
        require(position.owner == msg.sender, "not allowed");
        require(order.triggers[_orderId].status == TriggerStatus.OPEN, "TriggerOrder not Open");
        require(_amountPercent > 0 && _amountPercent <= BASIS_POINTS_DIVISOR, "invalid percent");

        order.triggers[_orderId].isTP = _isTP;
        order.triggers[_orderId].price = _price;
        order.triggers[_orderId].amountPercent = _amountPercent;
        order.triggers[_orderId].createdAt = block.timestamp;

        emit EditTriggerOrder(_posId, _orderId, _isTP, _price, _amountPercent);
    }

    function executeTriggerOrders(uint256 _posId) internal returns (uint256, uint256) {
        PositionTrigger storage order = triggerOrders[_posId];
        Position memory position = positionVault.getPosition(_posId);
        require(position.size > 0, "Trigger Not Open");
        uint256 price = priceManager.getLastPrice(position.tokenId);
        for (uint256 i = 0; i < EnumerableSetUpgradeable.length(aliveTriggerIds[_posId]); ++i) {
            uint256 idx = EnumerableSetUpgradeable.at(aliveTriggerIds[_posId], i);
            TriggerInfo storage trigger = order.triggers[idx];
            if (validateTrigger(trigger.status, trigger.isTP, position.isLong, trigger.price, price)) {
                uint256 triggerAmount = (position.size * trigger.amountPercent) / BASIS_POINTS_DIVISOR;
                trigger.triggeredAmount = triggerAmount;
                trigger.triggeredAt = block.timestamp;
                trigger.status = TriggerStatus.TRIGGERED;
                EnumerableSetUpgradeable.remove(aliveTriggerIds[_posId], idx);
                emit ExecuteTriggerOrders(_posId, trigger.triggeredAmount, idx, price);
                return (triggerAmount, price);
            }
        }
        revert("trigger not ready");
    }

    function validateTrigger(
        TriggerStatus _status,
        bool _isTP,
        bool _isLong,
        uint256 _triggerPrice,
        uint256 _lastPrice
    ) private pure returns (bool) {
        if (_status != TriggerStatus.OPEN) return false;

        if (_isTP) {
            if (_isLong) {
                if (_lastPrice >= _triggerPrice) return true;
            } else {
                if (_lastPrice <= _triggerPrice) return true;
            }
        } else {
            if (_isLong) {
                if (_lastPrice <= _triggerPrice) return true;
            } else {
                if (_lastPrice >= _triggerPrice) return true;
            }
        }

        return false;
    }

    /* ========== FOR CLOSING POSITIONS (TRAILING STOP ORDER) ========== */

    function addTrailingStop(address _account, uint256 _posId, uint256[] memory _params) external override onlyVault {
        Order storage order = orders[_posId];
        Position memory position = positionVault.getPosition(_posId);
        require(_account == position.owner, "you are not allowed to add trailing stop");
        require(position.size > 0, "position not alive");
        validateTrailingStopInputData(_params);
        if (position.size < _params[1]) {
            order.size = position.size;
        } else {
            order.size = _params[1];
        }
        order.collateral = _params[0];
        order.status = OrderStatus.PENDING;
        order.positionType = POSITION_TRAILING_STOP;
        order.stepType = _params[2];
        order.stpPrice = _params[3];
        order.stepAmount = _params[4];
        emit AddTrailingStop(_posId, _params);
    }

    function validateTrailingStopInputData(uint256[] memory _params) public pure returns (bool) {
        require(_params[1] > 0, "trailing size is zero");
        require(_params[4] > 0 && _params[3] > 0, "invalid trailing data");
        require(_params[2] <= 1, "invalid type");
        if (_params[2] == TRAILING_STOP_TYPE_PERCENT) {
            require(_params[4] < BASIS_POINTS_DIVISOR, "percent cant exceed 100%");
        }
        return true;
    }

    function updateTrailingStop(uint256 _posId) external nonReentrant {
        Position memory position = positionVault.getPosition(_posId);
        Order storage order = orders[_posId];
        uint256 price = priceManager.getLastPrice(position.tokenId);
        require(position.owner == msg.sender || operators.getOperatorLevel(msg.sender) >= 1, "updateTStop not allowed");
        require(position.size > 0, "position not alive");
        validateTrailingStopPrice(position.tokenId, position.isLong, _posId, true);
        uint256 oldStpPrice = order.stpPrice;
        if (position.isLong) {
            order.stpPrice = order.stepType == 0
                ? price - order.stepAmount
                : (price * (BASIS_POINTS_DIVISOR - order.stepAmount)) / BASIS_POINTS_DIVISOR;
        } else {
            order.stpPrice = order.stepType == 0
                ? price + order.stepAmount
                : (price * (BASIS_POINTS_DIVISOR + order.stepAmount)) / BASIS_POINTS_DIVISOR;
        }
        uint256 diff;
        if (order.stpPrice > oldStpPrice) {
            diff = order.stpPrice - oldStpPrice;
        } else {
            diff = oldStpPrice - order.stpPrice;
        }
        require(
            (diff * BASIS_POINTS_DIVISOR) / oldStpPrice >= settingsManager.priceMovementPercent(),
            "!price movement"
        );
        emit UpdateTrailingStop(_posId, order.stpPrice);
    }

    function validateTrailingStopPrice(
        uint256 _tokenId,
        bool _isLong,
        uint256 _posId,
        bool _raise
    ) public view returns (bool) {
        Order memory order = orders[_posId];
        uint256 price = priceManager.getLastPrice(_tokenId);
        uint256 stopPrice;
        if (_isLong) {
            if (order.stepType == TRAILING_STOP_TYPE_AMOUNT) {
                stopPrice = order.stpPrice + order.stepAmount;
            } else {
                stopPrice = (order.stpPrice * BASIS_POINTS_DIVISOR) / (BASIS_POINTS_DIVISOR - order.stepAmount);
            }
        } else {
            if (order.stepType == TRAILING_STOP_TYPE_AMOUNT) {
                stopPrice = order.stpPrice - order.stepAmount;
            } else {
                stopPrice = (order.stpPrice * BASIS_POINTS_DIVISOR) / (BASIS_POINTS_DIVISOR + order.stepAmount);
            }
        }
        bool flag;
        if (
            _isLong &&
            order.status == OrderStatus.PENDING &&
            order.positionType == POSITION_TRAILING_STOP &&
            stopPrice <= price
        ) {
            flag = true;
        } else if (
            !_isLong &&
            order.status == OrderStatus.PENDING &&
            order.positionType == POSITION_TRAILING_STOP &&
            stopPrice >= price
        ) {
            flag = true;
        }
        if (_raise) {
            require(flag, "price incorrect");
        }
        return flag;
    }

    /* ========== EXECUTE ORDERS ========== */

    function triggerForOpenOrders(uint256 _posId) external nonReentrant onlyOperator(1) {
        Position memory position = positionVault.getPosition(_posId);
        Order memory order = orders[_posId];
        require(order.status == OrderStatus.PENDING, "order not pending");
        uint256 price = priceManager.getLastPrice(position.tokenId);

        if (order.positionType == POSITION_LIMIT) {
            if (position.isLong) {
                require(order.lmtPrice >= price, "trigger not met");
            } else {
                require(order.lmtPrice <= price, "trigger not met");
            }
            positionVault.increasePosition(
                _posId,
                position.owner,
                position.tokenId,
                position.isLong,
                price,
                order.collateral,
                order.size,
                positionVault.getPaidFees(_posId).paidPositionFee
            );
            _updateOrder(_posId, order.positionType, 0, 0, OrderStatus.FILLED);
            positionVault.removeUserOpenOrder(position.owner, _posId);
        } else if (order.positionType == POSITION_STOP_MARKET) {
            if (position.isLong) {
                require(order.stpPrice <= price, "trigger not met");
            } else {
                require(order.stpPrice >= price, "trigger not met");
            }
            positionVault.increasePosition(
                _posId,
                position.owner,
                position.tokenId,
                position.isLong,
                price,
                order.collateral,
                order.size,
                positionVault.getPaidFees(_posId).paidPositionFee
            );
            _updateOrder(_posId, order.positionType, 0, 0, OrderStatus.FILLED);
            positionVault.removeUserOpenOrder(position.owner, _posId);
        } else if (order.positionType == POSITION_STOP_LIMIT) {
            if (position.isLong) {
                require(order.stpPrice <= price, "trigger not met");
            } else {
                require(order.stpPrice >= price, "trigger not met");
            }
            _updateOrder(_posId, POSITION_LIMIT, order.collateral, order.size, order.status);
        } else if (order.positionType == POSITION_TRAILING_STOP) {
            if (position.isLong) {
                require(order.stpPrice >= price, "trigger not met");
            } else {
                require(order.stpPrice <= price, "trigger not met");
            }
            positionVault.decreasePositionByOrderVault(_posId, price, order.size);
            _updateOrder(_posId, POSITION_MARKET, 0, 0, OrderStatus.FILLED);
        } else {
            revert("!positionType");
        }
    }

    function triggerForTPSL(uint256 _posId) external nonReentrant onlyOperator(1) {
        (uint256 triggeredAmount, uint256 triggerPrice) = executeTriggerOrders(_posId);
        positionVault.decreasePositionByOrderVault(_posId, triggerPrice, triggeredAmount);
    }

    /* ========== VIEW FUNCTIONS ========== */

    function getOrder(uint256 _posId) external view override returns (Order memory) {
        return orders[_posId];
    }

    function getAddPositionOrder(uint256 _posId) external view override returns (AddPositionOrder memory) {
        return addPositionOrders[_posId];
    }

    function getDecreasePositionOrder(uint256 _posId) external view override returns (DecreasePositionOrder memory) {
        return decreasePositionOrders[_posId];
    }

    function getTriggerOrderInfo(uint256 _posId) external view override returns (PositionTrigger memory) {
        return triggerOrders[_posId];
    }

    function getAliveTriggerIds(uint256 _posId) external view returns (uint256[] memory _aliveTriggerIds) {
        uint256 length = EnumerableSetUpgradeable.length(aliveTriggerIds[_posId]);
        _aliveTriggerIds = new uint256[](length);

        for (uint256 i; i < length; ++i) {
            _aliveTriggerIds[i] = EnumerableSetUpgradeable.at(aliveTriggerIds[_posId], i);
        }
    }
}