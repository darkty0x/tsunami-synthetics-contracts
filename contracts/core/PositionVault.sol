// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/ILiquidateVault.sol";
import "./interfaces/IPositionVault.sol";
import "./interfaces/IPriceManager.sol";
import "./interfaces/ISettingsManager.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IOrderVault.sol";
import "./interfaces/IOperators.sol";

import {Constants} from "../access/Constants.sol";
import {OrderStatus, PaidFees, Temp} from "./structs.sol";

contract PositionVault is Constants, Initializable, ReentrancyGuardUpgradeable, IPositionVault {
    // constants
    ISettingsManager private settingsManager;
    ILiquidateVault private liquidateVault;
    IPriceManager private priceManager;
    IOrderVault private orderVault;
    IOperators private operators;
    IVault private vault;
    bool private isInitialized;

    // variables
    uint256 public override lastPosId;
    mapping(uint256 => Position) private positions; // posId => Position{}
    mapping(address => uint256[]) private userPositionIds; // userAddress => alive posIds[]
    mapping(address => uint256[]) private userOpenOrderIds; // userAddress => open orderIds[]
    mapping(uint256 => uint256) private userAliveIndexOf; // posId => index of userPositionIds[user], note that a position can only have a user
    mapping(uint256 => uint256) private userOpenOrderIndexOf; // posId => index of userPositionIds[user], note that a position can only have a user
    mapping(uint256 => PaidFees) private paidFees; // to track paid fees for each position

    // variables to faciliate market order execution (easier to batch execute and track without using event)
    uint256 public queueIndex;
    uint256[] public queuePosIds;

    mapping(uint256 => uint256) public removeCollateralOrders; // posId => collateralAmount

    event AddOrRemoveCollateral(uint256 posId, bool isPlus, uint256 amount, uint256 collateral, uint256 size);
    event ExecuteRemoveCollateral(uint256 posId);
    event ExecuteRemoveCollateralError(uint256 indexed posId, address indexed account, string err);
    event CreateAddPositionOrder(uint256 posId, uint256 collateral, uint256 size, uint256 allowedPrice);
    event CreateDecreasePositionOrder(uint256 posId, uint256 size, uint256 allowedPrice);
    event ExecuteAddPositionOrder(uint256 posId, uint256 collateral, uint256 size, uint256 feeUsd);
    event ExecuteDecreasePositionOrder(uint256 posId, uint256 size);
    event MarketOrderExecutionError(uint256 indexed posId, address indexed account, string err);
    event AddPositionExecutionError(uint256 indexed posId, address indexed account, string err);
    event DecreasePositionExecutionError(uint256 indexed posId, address indexed account, string err);
    event IncreasePosition(
        uint256 indexed posId,
        address indexed account,
        uint256 indexed tokenId,
        bool isLong,
        uint256[5] posData
    );
    event DecreasePosition(
        uint256 indexed posId,
        address indexed account,
        uint256 indexed tokenId,
        bool isLong,
        int256[3] pnlData,
        uint256[5] posData
    );
    event ClosePosition(
        uint256 indexed posId,
        address indexed account,
        uint256 indexed tokenId,
        bool isLong,
        int256[3] pnlData,
        uint256[5] posData
    );

    modifier onlyVault() {
        _onlyVault();
        _;
    }

    function _onlyVault() private view {
        require(msg.sender == address(vault), "Only vault");
    }

    modifier onlyOrderVault() {
        _onlyOrderVault();
        _;
    }

    function _onlyOrderVault() private view {
        require(msg.sender == address(orderVault), "Only vault");
    }

    modifier onlyLiquidateVault() {
        require(msg.sender == address(liquidateVault), "Only vault");
        _;
    }

    modifier onlyOperator(uint256 level) {
        _onlyOperator(level);
        _;
    }

    function _onlyOperator(uint256 level) private view {
        require(operators.getOperatorLevel(msg.sender) >= level, "invalid operator");
    }

    /* ========== INITIALIZE FUNCTIONS ========== */

    function initialize(address _vault, address _priceManager, address _operators) public initializer {
        __ReentrancyGuard_init();
        // intitialize the admins
        vault = IVault(_vault);
        priceManager = IPriceManager(_priceManager);
        operators = IOperators(_operators);
    }

    function init(
        IOrderVault _orderVault,
        ILiquidateVault _liquidateVault,
        ISettingsManager _settingsManager
    ) external {
        require(!isInitialized, "initialized");

        liquidateVault = _liquidateVault;
        orderVault = _orderVault;
        settingsManager = _settingsManager;

        isInitialized = true;
    }

    /* ========== USER FUNCTIONS ========== */

    function newPositionOrder(
        address _account,
        uint256 _tokenId,
        bool _isLong,
        OrderType _orderType,
        // 0 -> market order
        // 1 -> limit order
        // 2 -> stop-market order
        // 3 -> stop-limit order
        uint256[] memory _params,
        // for market order:  _params[0] -> allowed price (revert if exceeded)
        // for limit order: _params[0] -> limit price
        // In stop-market order: _params[1] -> stop price,
        // In stop-limit order: _params[0] -> limit price, _params[1] -> stop price
        // for all orders: _params[2] -> collateral
        // for all orders: _params[3] -> size
        address _refer
    ) external onlyVault {
        validateIncreasePosition(_tokenId, _params[2], _params[3]);

        uint256 _lastPosId = lastPosId;
        Position storage position = positions[_lastPosId];
        position.owner = _account;
        position.refer = _refer;
        position.tokenId = _tokenId;
        position.isLong = _isLong;

        uint256 fee = settingsManager.getTradingFee(_account, _tokenId, _isLong, _params[3]);
        paidFees[_lastPosId].paidPositionFee = fee;
        vault.takeVUSDIn(_account, _params[2] + fee);

        if (_orderType == OrderType.MARKET) {
            require(
                !settingsManager.isIncreasingPositionDisabled(_tokenId),
                "current asset is disabled from increasing position"
            );
            require(_params[0] > 0, "market price is invalid");
            orderVault.createNewOrder(_lastPosId, _account, _isLong, _tokenId, POSITION_MARKET, _params, _refer);
            queuePosIds.push(_lastPosId);
        } else if (_orderType == OrderType.LIMIT) {
            require(_params[0] > 0, "limit price is invalid");
            orderVault.createNewOrder(_lastPosId, _account, _isLong, _tokenId, POSITION_LIMIT, _params, _refer);
            _addUserOpenOrder(position.owner, _lastPosId);
        } else if (_orderType == OrderType.STOP) {
            require(_params[1] > 0, "stop price is invalid");
            orderVault.createNewOrder(_lastPosId, _account, _isLong, _tokenId, POSITION_STOP_MARKET, _params, _refer);
            _addUserOpenOrder(position.owner, _lastPosId);
        } else if (_orderType == OrderType.STOP_LIMIT) {
            require(_params[0] > 0 && _params[1] > 0, "stop limit price is invalid");
            orderVault.createNewOrder(_lastPosId, _account, _isLong, _tokenId, POSITION_STOP_LIMIT, _params, _refer);
            _addUserOpenOrder(position.owner, _lastPosId);
        } else {
            revert("invalid order type");
        }

        lastPosId = _lastPosId + 1;
    }

    function addOrRemoveCollateral(
        address _account,
        uint256 _posId,
        bool isPlus,
        uint256 _amount
    ) external override onlyVault {
        Position storage position = positions[_posId];
        require(_account == position.owner, "you are not allowed to add position");
        require(position.size > 0, "Position not Open");

        if (isPlus) {
            position.collateral += _amount;
            validateMinLeverage(position.size, position.collateral);
            vault.takeVUSDIn(_account, _amount);
            emit AddOrRemoveCollateral(_posId, isPlus, _amount, position.collateral, position.size);
        } else {
            require(removeCollateralOrders[_posId] == 0, "order already exists");
            removeCollateralOrders[_posId] = _amount;

            queuePosIds.push(3 * 2 ** 128 + _posId);
        }
    }

    function createAddPositionOrder(
        address _account,
        uint256 _posId,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _allowedPrice
    ) external override onlyVault {
        Position memory position = positions[_posId];

        require(
            !settingsManager.isIncreasingPositionDisabled(position.tokenId),
            "current asset is disabled from increasing position"
        );
        require(position.size > 0, "Position not Open");
        require(_account == position.owner, "you are not allowed to add position");
        validateIncreasePosition(position.tokenId, _collateralDelta, _sizeDelta);

        uint256 fee = settingsManager.getTradingFee(_account, position.tokenId, position.isLong, _sizeDelta);
        vault.takeVUSDIn(_account, _collateralDelta + fee);
        orderVault.createAddPositionOrder(_account, _posId, _collateralDelta, _sizeDelta, _allowedPrice, fee);

        queuePosIds.push(2 ** 128 + _posId);

        emit CreateAddPositionOrder(_posId, _collateralDelta, _sizeDelta, _allowedPrice);
    }

    function createDecreasePositionOrder(
        uint256 _posId,
        address _account,
        uint256 _sizeDelta,
        uint256 _allowedPrice
    ) external override onlyVault {
        Position memory position = positions[_posId];

        require(_sizeDelta > 0, "invalid size");
        require(position.size > 0, "Position not Open");
        require(_account == position.owner, "not allowed");

        orderVault.createDecreasePositionOrder(_posId, _sizeDelta, _allowedPrice);

        queuePosIds.push(2 ** 129 + _posId);

        emit CreateDecreasePositionOrder(_posId, _sizeDelta, _allowedPrice);
    }

    // allow users to close their positions themselves after selfExecuteCooldown, in case keepers are down
    function selfExecuteDecreasePositionOrder(uint256 _posId) external nonReentrant {
        Position memory position = positions[_posId];
        require(msg.sender == position.owner, "!owner");

        DecreasePositionOrder memory decreasePositionOrder = orderVault.getDecreasePositionOrder(_posId);
        require(
            block.timestamp > decreasePositionOrder.timestamp + settingsManager.selfExecuteCooldown(),
            "cannot self execute yet"
        );

        uint256 price = priceManager.getLastPrice(position.tokenId);
        // without check slippage to ensure success execute
        // user should read contract price feed to know the price before execution
        _decreasePosition(_posId, price, decreasePositionOrder.size);
        orderVault.deleteDecreasePositionOrder(_posId);
    }

    /* ========== OPERATOR FUNCTIONS ========== */

    function executeRemoveCollateral(uint256 _posId) external nonReentrant onlyOperator(1) {
        uint256 removeCollateralAmount = removeCollateralOrders[_posId];
        require(removeCollateralAmount > 0, "empty order");
        Position storage position = positions[_posId];
        require(position.size > 0, "Position not Open");

        position.collateral -= removeCollateralAmount;
        validateMaxLeverage(position.tokenId, position.size, position.collateral);
        (bool isPositionLiquidatable, , , ) = liquidateVault.validateLiquidationWithPosid(_posId);
        require(!isPositionLiquidatable, "position will be liquidated");
        vault.takeVUSDOut(position.owner, removeCollateralAmount);

        delete removeCollateralOrders[_posId];

        emit AddOrRemoveCollateral(_posId, false, removeCollateralAmount, position.collateral, position.size);
    }

    function executeOpenMarketOrder(uint256 _posId) public nonReentrant onlyOperator(1) {
        Position memory position = positions[_posId];
        Order memory order = orderVault.getOrder(_posId);

        require(order.size > 0 && order.status == OrderStatus.PENDING, "not open");
        require(order.positionType == POSITION_MARKET, "not market order");
        require(block.timestamp <= order.timestamp + settingsManager.expiryDuration(), "order has expired");

        uint256 price = priceManager.getLastPrice(position.tokenId);
        uint256 priceWithSlippage = settingsManager.getPriceWithSlippage(
            position.tokenId,
            position.isLong,
            order.size,
            price
        );
        checkSlippage(position.isLong, order.lmtPrice, priceWithSlippage);

        _increasePosition(
            _posId,
            position.owner,
            position.tokenId,
            position.isLong,
            price,
            order.collateral,
            order.size,
            paidFees[_posId].paidPositionFee
        );
        orderVault.updateOrder(_posId, order.positionType, 0, 0, OrderStatus.FILLED);
    }

    function executeAddPositionOrder(uint256 _posId) external nonReentrant onlyOperator(1) {
        Position memory position = positions[_posId];
        AddPositionOrder memory addPositionOrder = orderVault.getAddPositionOrder(_posId);

        require(addPositionOrder.size > 0, "order size is 0");
        require(block.timestamp <= addPositionOrder.timestamp + settingsManager.expiryDuration(), "order has expired");

        uint256 price = priceManager.getLastPrice(position.tokenId);
        uint256 priceWithSlippage = settingsManager.getPriceWithSlippage(
            position.tokenId,
            position.isLong,
            addPositionOrder.size,
            price
        );
        checkSlippage(position.isLong, addPositionOrder.allowedPrice, priceWithSlippage);

        _increasePosition(
            _posId,
            position.owner,
            position.tokenId,
            position.isLong,
            price,
            addPositionOrder.collateral,
            addPositionOrder.size,
            addPositionOrder.fee
        );
        orderVault.deleteAddPositionOrder(_posId);

        emit ExecuteAddPositionOrder(_posId, addPositionOrder.collateral, addPositionOrder.size, addPositionOrder.fee);
    }

    function executeDecreasePositionOrder(uint256 _posId) external nonReentrant onlyOperator(1) {
        Position memory position = positions[_posId];
        DecreasePositionOrder memory decreasePositionOrder = orderVault.getDecreasePositionOrder(_posId);

        require(
            block.timestamp <= decreasePositionOrder.timestamp + settingsManager.expiryDuration(),
            "order has expired"
        );

        uint256 decreaseSize = decreasePositionOrder.size > position.size ? position.size : decreasePositionOrder.size;
        uint256 price = priceManager.getLastPrice(position.tokenId);
        uint256 priceWithSlippage = settingsManager.getPriceWithSlippage(
            position.tokenId,
            !position.isLong, // decreasePosition is in opposite direction
            decreaseSize,
            price
        );
        checkSlippage(!position.isLong, decreasePositionOrder.allowedPrice, priceWithSlippage);

        _decreasePosition(_posId, price, decreaseSize);
        orderVault.deleteDecreasePositionOrder(_posId);

        emit ExecuteDecreasePositionOrder(_posId, decreaseSize);
    }

    function executeOrders(uint256 numOfOrders) external onlyOperator(1) {
        uint256 index = queueIndex;
        uint256 endIndex = index + numOfOrders;
        uint256 length = queuePosIds.length;

        if (index >= length) revert("nothing to execute");
        if (endIndex > length) endIndex = length;

        while (index < endIndex) {
            uint256 t = queuePosIds[index];
            uint256 orderType = t / 2 ** 128;
            uint256 posId = t % 2 ** 128;

            if (orderType == 0) {
                try this.executeOpenMarketOrder(posId) {} catch Error(string memory err) {
                    orderVault.cancelMarketOrder(posId);
                    emit MarketOrderExecutionError(posId, positions[posId].owner, err);
                } catch {
                    orderVault.cancelMarketOrder(posId);
                }
            } else if (orderType == 1) {
                try this.executeAddPositionOrder(posId) {} catch Error(string memory err) {
                    orderVault.cancelAddPositionOrder(posId);
                    emit AddPositionExecutionError(posId, positions[posId].owner, err);
                } catch {
                    orderVault.cancelAddPositionOrder(posId);
                }
            } else if (orderType == 2) {
                try this.executeDecreasePositionOrder(posId) {} catch Error(string memory err) {
                    orderVault.deleteDecreasePositionOrder(posId);
                    emit DecreasePositionExecutionError(posId, positions[posId].owner, err);
                } catch {
                    orderVault.deleteDecreasePositionOrder(posId);
                }
            } else if (orderType == 3) {
                try this.executeRemoveCollateral(posId) {} catch Error(string memory err) {
                    delete removeCollateralOrders[posId];
                    emit ExecuteRemoveCollateralError(posId, positions[posId].owner, err);
                } catch {
                    delete removeCollateralOrders[posId];
                }
            }

            delete queuePosIds[index];
            ++index;
        }

        queueIndex = index;
    }

    /* ========== HELPER FUNCTIONS ========== */

    function _increasePosition(
        uint256 _posId,
        address _account,
        uint256 _tokenId,
        bool _isLong,
        uint256 _price,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _fee
    ) internal {
        require(
            !settingsManager.isIncreasingPositionDisabled(_tokenId),
            "current asset is disabled from increasing position"
        );

        Position storage position = positions[_posId];

        validateIncreasePosition(position.tokenId, position.collateral + _collateralDelta, position.size + _sizeDelta);

        _price = settingsManager.getPriceWithSlippage(position.tokenId, position.isLong, _sizeDelta, _price);

        settingsManager.updateFunding(_tokenId);
        settingsManager.increaseOpenInterest(_tokenId, _account, _isLong, _sizeDelta);

        if (position.size == 0) {
            position.averagePrice = _price;
            position.fundingIndex = settingsManager.fundingIndex(_tokenId);

            _addUserAlivePosition(_account, _posId);
        } else {
            position.averagePrice =
                (position.size * position.averagePrice + _sizeDelta * _price) /
                (position.size + _sizeDelta);
            position.fundingIndex =
                (int256(position.size) *
                    position.fundingIndex +
                    int256(_sizeDelta) *
                    settingsManager.fundingIndex(_tokenId)) /
                int256(position.size + _sizeDelta);
            position.accruedBorrowFee += settingsManager.getBorrowFee(
                position.size,
                position.lastIncreasedTime,
                _tokenId,
                _isLong
            );

            paidFees[_posId].paidPositionFee += _fee;
        }

        position.collateral += _collateralDelta;
        position.size += _sizeDelta;
        position.lastIncreasedTime = block.timestamp;

        vault.distributeFee(_fee, position.refer, _account);

        emit IncreasePosition(
            _posId,
            _account,
            _tokenId,
            _isLong,
            [_collateralDelta, _sizeDelta, position.averagePrice, _price, _fee]
        );
    }

    function increasePosition(
        uint256 _posId,
        address _account,
        uint256 _tokenId,
        bool _isLong,
        uint256 _price,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _fee
    ) external override onlyOrderVault {
        _increasePosition(_posId, _account, _tokenId, _isLong, _price, _collateralDelta, _sizeDelta, _fee);
    }

    function _decreasePosition(uint256 _posId, uint256 _price, uint256 _sizeDelta) internal {
        Position storage position = positions[_posId];

        require(
            !settingsManager.isDecreasingPositionDisabled(position.tokenId),
            "current asset is disabled from decreasing position"
        );
        require(position.size > 0, "position size is zero");
        require(_sizeDelta > 0, "_sizeDelta is zero");
        require(block.timestamp > position.lastIncreasedTime + settingsManager.closeDeltaTime(), "!closeDeltaTime");

        if (_sizeDelta >= position.size) _sizeDelta = position.size;

        _price = settingsManager.getPriceWithSlippage(position.tokenId, !position.isLong, _sizeDelta, _price); // decreasePosition is in opposite direction

        settingsManager.updateFunding(position.tokenId);
        settingsManager.decreaseOpenInterest(position.tokenId, position.owner, position.isLong, _sizeDelta);

        uint256 countedBorrowFee;
        if (position.accruedBorrowFee > 0) {
            countedBorrowFee = (position.accruedBorrowFee * _sizeDelta) / position.size;
            position.accruedBorrowFee -= countedBorrowFee;
        }

        (int256 pnl, int256 fundingFee, int256 borrowFee) = settingsManager.getPnl(
            position.tokenId,
            position.isLong,
            _sizeDelta,
            position.averagePrice,
            _price,
            position.lastIncreasedTime,
            countedBorrowFee,
            position.fundingIndex
        );

        uint256 fee = settingsManager.getTradingFee(position.owner, position.tokenId, !position.isLong, _sizeDelta);

        uint256 collateralDelta = (position.collateral * _sizeDelta) / position.size;

        int256 usdOut = int256(collateralDelta) + pnl - int256(fee);
        if (usdOut > 0) vault.takeVUSDOut(position.owner, uint256(usdOut));

        if (pnl >= 0) {
            if (block.timestamp - position.lastIncreasedTime < settingsManager.minProfitDurations(position.tokenId)) {
                uint256 profitPercent = (BASIS_POINTS_DIVISOR * uint256(pnl)) / collateralDelta;
                if (
                    profitPercent > settingsManager.maxCloseProfitPercents(position.tokenId) ||
                    uint256(pnl) > settingsManager.maxCloseProfits(position.tokenId)
                ) {
                    revert("min profit duration not yet passed");
                }
            }

            vault.accountDeltaIntoTotalUSD(false, uint256(pnl));
        } else {
            uint256 loss = uint256(-1 * pnl);
            uint256 maxLoss = collateralDelta - fee;
            if (loss > maxLoss) {
                vault.accountDeltaIntoTotalUSD(true, maxLoss);
            } else {
                vault.accountDeltaIntoTotalUSD(true, loss);
            }
        }

        vault.distributeFee(fee, position.refer, position.owner);

        // split fundingFee & borrowFee with vault & feeManager
        {
            int256 totalFees = fundingFee + borrowFee;
            if (totalFees >= 0) {
                uint256 totalFeesForFeeManager = (uint256(totalFees) *
                    (BASIS_POINTS_DIVISOR - settingsManager.feeRewardBasisPoints())) / BASIS_POINTS_DIVISOR;
                // take out accounted fees from vault and send to feeManager
                vault.accountDeltaIntoTotalUSD(false, totalFeesForFeeManager);
                vault.takeVUSDOut(settingsManager.feeManager(), totalFeesForFeeManager);
            } else {
                uint256 totalFeesForFeeManager = (uint256(-1 * totalFees) *
                    (BASIS_POINTS_DIVISOR - settingsManager.feeRewardBasisPoints())) / BASIS_POINTS_DIVISOR;
                // take out fees from feeManager and send to vault
                vault.accountDeltaIntoTotalUSD(true, totalFeesForFeeManager);
                vault.takeVUSDIn(settingsManager.feeManager(), totalFeesForFeeManager);
            }
        }

        if (_sizeDelta < position.size) {
            position.size -= _sizeDelta;
            position.collateral -= collateralDelta;
            paidFees[_posId].paidPositionFee += fee;
            paidFees[_posId].paidBorrowFee += uint256(borrowFee);
            paidFees[_posId].paidFundingFee += fundingFee;

            Temp memory temp = Temp({a: collateralDelta, b: _sizeDelta, c: position.averagePrice, d: _price, e: fee}); // use struct to prevent stack too deep error
            emit DecreasePosition(
                _posId,
                position.owner,
                position.tokenId,
                position.isLong,
                [pnl, fundingFee, borrowFee],
                [temp.a, temp.b, temp.c, temp.d, temp.e]
            );
        } else {
            Temp memory temp = Temp({a: collateralDelta, b: _sizeDelta, c: position.averagePrice, d: _price, e: fee}); // use struct to prevent stack too deep error
            emit ClosePosition(
                _posId,
                position.owner,
                position.tokenId,
                position.isLong,
                [pnl, fundingFee, borrowFee],
                [temp.a, temp.b, temp.c, temp.d, temp.e]
            );

            _removeUserAlivePosition(position.owner, _posId);
        }
    }

    // for vault to directly close user's position in forceClosePosition()
    function decreasePosition(uint256 _posId, uint256 _price, uint256 _sizeDelta) external override onlyVault {
        _decreasePosition(_posId, _price, _sizeDelta);
    }

    function decreasePositionByOrderVault(
        uint256 _posId,
        uint256 _price,
        uint256 _sizeDelta
    ) external override onlyOrderVault {
        _decreasePosition(_posId, _price, _sizeDelta);
    }

    function _addUserAlivePosition(address _user, uint256 _posId) internal {
        userAliveIndexOf[_posId] = userPositionIds[_user].length;
        userPositionIds[_user].push(_posId);
    }

    function _addUserOpenOrder(address _user, uint256 _posId) internal {
        userOpenOrderIndexOf[_posId] = userOpenOrderIds[_user].length;
        userOpenOrderIds[_user].push(_posId);
    }

    function removeUserAlivePosition(address _user, uint256 _posId) external override onlyLiquidateVault {
        _removeUserAlivePosition(_user, _posId);
    }

    function _removeUserAlivePosition(address _user, uint256 _posId) internal {
        uint256 index = userAliveIndexOf[_posId];
        uint256 lastIndex = userPositionIds[_user].length - 1;
        uint256 lastId = userPositionIds[_user][lastIndex];
        delete positions[_posId];
        userAliveIndexOf[lastId] = index;
        delete userAliveIndexOf[_posId];

        userPositionIds[_user][index] = lastId;
        userPositionIds[_user].pop();

        orderVault.cancelAddPositionOrder(_posId);
    }

    function removeUserOpenOrder(address _user, uint256 _posId) external override onlyOrderVault {
        _removeUserOpenOrder(_user, _posId);
    }

    function _removeUserOpenOrder(address _user, uint256 _posId) internal {
        uint256 index = userOpenOrderIndexOf[_posId];
        uint256 lastIndex = userOpenOrderIds[_user].length - 1;
        uint256 lastId = userOpenOrderIds[_user][lastIndex];
        userOpenOrderIndexOf[lastId] = index;
        delete userOpenOrderIndexOf[_posId];
        userOpenOrderIds[_user][index] = lastId;
        userOpenOrderIds[_user].pop();
    }

    /* ========== VALIDATE FUNCTIONS ========== */

    function validateIncreasePosition(uint256 _tokenId, uint256 _collateral, uint256 _size) internal view {
        require(_collateral >= settingsManager.minCollateral(), "!minCollateral");
        validateMinLeverage(_size, _collateral);
        validateMaxLeverage(_tokenId, _size, _collateral);
    }

    function validateMinLeverage(uint256 _size, uint256 _collateral) internal pure {
        require(_size >= _collateral, "leverage cannot be less than 1");
    }

    function validateMaxLeverage(uint256 _tokenId, uint256 _size, uint256 _collateral) internal view {
        require(_size * MIN_LEVERAGE <= _collateral * priceManager.maxLeverage(_tokenId), "maxLeverage exceeded");
    }

    /* ========== VIEW FUNCTIONS ========== */

    function getPosition(uint256 _posId) external view override returns (Position memory) {
        return positions[_posId];
    }

    function getUserPositionIds(address _account) external view override returns (uint256[] memory) {
        return userPositionIds[_account];
    }

    function getUserOpenOrderIds(address _account) external view override returns (uint256[] memory) {
        return userOpenOrderIds[_account];
    }

    function getPaidFees(uint256 _posId) external view override returns (PaidFees memory) {
        return paidFees[_posId];
    }

    function getNumOfUnexecuted() external view returns (uint256) {
        return queuePosIds.length - queueIndex;
    }

    function getVaultUSDBalance() external view override returns (uint256) {
        return vault.getVaultUSDBalance();
    }
}