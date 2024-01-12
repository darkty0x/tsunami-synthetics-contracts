// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../tokens/interfaces/IMintable.sol";
import "../tokens/interfaces/IVUSD.sol";
import "./interfaces/IPositionVault.sol";
import "./interfaces/ILiquidateVault.sol";
import "./interfaces/IOrderVault.sol";
import "./interfaces/IPriceManager.sol";
import "./interfaces/ISettingsManager.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IOperators.sol";
import {Constants} from "../access/Constants.sol";
import {Position, OrderStatus, OrderType} from "./structs.sol";

contract Vault is Constants, Initializable, ReentrancyGuardUpgradeable, IVault {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // constants
    IPositionVault private positionVault;
    IOrderVault private orderVault;
    ILiquidateVault private liquidateVault;
    IOperators public operators;
    IPriceManager private priceManager;
    ISettingsManager private settingsManager;
    address private vlp;
    address private vusd;
    bool private isInitialized;

    // variables
    uint256 public totalUSD;
    mapping(address => uint256) public override lastStakedAt;
    IERC20Upgradeable private USDC;
    mapping(address => uint256) public lastStakedBlockAt;
    mapping(address => address) public platformUsed; // trader address => address of platform used

    event Deposit(address indexed account, address indexed token, uint256 amount);
    event Withdraw(address indexed account, address indexed token, uint256 amount);
    event Stake(address indexed account, address token, uint256 amount, uint256 mintAmount);
    event Unstake(address indexed account, address token, uint256 vlpAmount, uint256 amountOut);
    event ForceClose(uint256 indexed posId, address indexed account, uint256 exceededPnl);
    event ReferFeeTransfer(address indexed account, uint256 amount);
    event ReferFeeTraderRebate(address indexed account, uint256 amount, address indexed trader, uint256 rebate);
    event PlatformFeeTransfer(address indexed account, uint256 amount, address indexed trader);

    modifier onlyVault() {
        _onlyVault();
        _;
    }

    function _onlyVault() private view {
        require(
            msg.sender == address(positionVault) ||
                msg.sender == address(liquidateVault) ||
                msg.sender == address(orderVault),
            "Only vault"
        );
    }

    modifier preventBanners(address _account) {
        _preventBanners(_account);
        _;
    }

    function _preventBanners(address _account) private view {
        require(!settingsManager.checkBanList(_account), "Account banned");
    }

    modifier onlyOperator(uint256 level) {
        _onlyOperator(level);
        _;
    }

    function _onlyOperator(uint256 level) private view {
        require(operators.getOperatorLevel(msg.sender) >= level, "invalid operator");
    }

    /* ========== INITIALIZE FUNCTIONS ========== */

    function initialize(address _operators, address _vlp, address _vusd) public initializer {
        require(AddressUpgradeable.isContract(_operators), "operators invalid");

        __ReentrancyGuard_init();
        operators = IOperators(_operators);
        vlp = _vlp;
        vusd = _vusd;
    }

    function setVaultSettings(
        IPriceManager _priceManager,
        ISettingsManager _settingsManager,
        IPositionVault _positionVault,
        IOrderVault _orderVault,
        ILiquidateVault _liquidateVault
    ) external onlyOperator(4) {
        require(!isInitialized, "initialized");
        require(AddressUpgradeable.isContract(address(_priceManager)), "priceManager invalid");
        require(AddressUpgradeable.isContract(address(_settingsManager)), "settingsManager invalid");
        require(AddressUpgradeable.isContract(address(_positionVault)), "positionVault invalid");
        require(AddressUpgradeable.isContract(address(_orderVault)), "orderVault invalid");
        require(AddressUpgradeable.isContract(address(_liquidateVault)), "liquidateVault invalid");

        priceManager = _priceManager;
        settingsManager = _settingsManager;
        positionVault = _positionVault;
        orderVault = _orderVault;
        liquidateVault = _liquidateVault;
        isInitialized = true;
    }

    function setUSDC(IERC20Upgradeable _token) external onlyOperator(3) {
        USDC = _token;
    }

    /* ========== CORE FUNCTIONS ========== */

    // deposit stablecoin to mint vusd
    function deposit(address _account, address _token, uint256 _amount) public nonReentrant preventBanners(msg.sender) {
        require(settingsManager.isDeposit(_token), "deposit not allowed");
        require(_amount > 0, "zero amount");
        if (_account != msg.sender) {
            require(settingsManager.checkDelegation(_account, msg.sender), "Not allowed");
        }

        IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 usdAmount = priceManager.tokenToUsd(_token, _amount);
        uint256 depositFee = (usdAmount * settingsManager.depositFee(_token)) / BASIS_POINTS_DIVISOR;
        _distributeFee(depositFee, address(0), address(0));

        IVUSD(vusd).mint(_account, usdAmount - depositFee);

        emit Deposit(_account, _token, _amount);
    }

    function depositSelf(address _token, uint256 _amount) external {
        deposit(msg.sender, _token, _amount);
    }

    function depositSelfUSDC(uint256 _amount) external {
        deposit(msg.sender, address(USDC), _amount);
    }

    function depositSelfAllUSDC() external {
        deposit(msg.sender, address(USDC), USDC.balanceOf(msg.sender));
    }

    // burn vusd to withdraw stablecoin
    function withdraw(address _token, uint256 _amount) public nonReentrant preventBanners(msg.sender) {
        require(settingsManager.isWithdraw(_token), "withdraw not allowed");
        require(_amount > 0, "zero amount");

        IVUSD(vusd).burn(address(msg.sender), _amount);

        uint256 withdrawFee = (_amount * settingsManager.withdrawFee(_token)) / BASIS_POINTS_DIVISOR;
        _distributeFee(withdrawFee, address(0), address(0));

        uint256 tokenAmount = priceManager.usdToToken(_token, _amount - withdrawFee);
        IERC20Upgradeable(_token).safeTransfer(msg.sender, tokenAmount);

        emit Withdraw(address(msg.sender), _token, tokenAmount);
    }

    function withdrawUSDC(uint256 _amount) external {
        withdraw(address(USDC), _amount);
    }

    function withdrawAllUSDC() external {
        withdraw(address(USDC), IVUSD(vusd).balanceOf(msg.sender));
    }

    // stake stablecoin to mint vlp
    function stake(address _account, address _token, uint256 _amount) public nonReentrant preventBanners(msg.sender) {
        require(settingsManager.isStakingEnabled(_token), "staking disabled");
        require(_amount > 0, "zero amount");
        if (_account != msg.sender) require(settingsManager.checkDelegation(_account, msg.sender), "Not allowed");

        IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 usdAmount = priceManager.tokenToUsd(_token, _amount);
        uint256 stakingFee = (usdAmount * settingsManager.stakingFee(_token)) / BASIS_POINTS_DIVISOR;
        uint256 usdAmountAfterFee = usdAmount - stakingFee;

        uint256 mintAmount;
        uint256 totalVLP = IERC20Upgradeable(vlp).totalSupply();
        if (totalVLP == 0) {
            mintAmount =
                (usdAmountAfterFee * DEFAULT_VLP_PRICE * (10 ** VLP_DECIMALS)) /
                (PRICE_PRECISION * BASIS_POINTS_DIVISOR);
        } else {
            mintAmount = (usdAmountAfterFee * totalVLP) / totalUSD;
        }

        require(totalVLP + mintAmount <= settingsManager.maxTotalVlp(), "max total vlp exceeded");

        _distributeFee(stakingFee, address(0), address(0));

        totalUSD += usdAmountAfterFee;
        lastStakedAt[_account] = block.timestamp;
        IMintable(vlp).mint(_account, mintAmount);

        emit Stake(_account, _token, _amount, mintAmount);
    }

    function stakeSelf(address _token, uint256 _amount) external {
        stake(msg.sender, _token, _amount);
    }

    function stakeSelfUSDC(uint256 _amount) external {
        stake(msg.sender, address(USDC), _amount);
    }

    function stakeSelfAllUSDC() external {
        stake(msg.sender, address(USDC), USDC.balanceOf(msg.sender));
    }

    // burn vlp to unstake stablecoin
    // vlp cannot be unstaked or transferred within cooldown period, except whitelisted contracts
    function unstake(address _tokenOut, uint256 _vlpAmount) public nonReentrant preventBanners(msg.sender) {
        require(settingsManager.isUnstakingEnabled(_tokenOut), "unstaking disabled");
        uint256 totalVLP = IERC20Upgradeable(vlp).totalSupply();
        require(_vlpAmount > 0 && _vlpAmount <= totalVLP, "vlpAmount error");
        if (settingsManager.isWhitelistedFromCooldown(msg.sender) == false) {
            require(
                lastStakedAt[msg.sender] + settingsManager.cooldownDuration() <= block.timestamp,
                "cooldown duration not yet passed"
            );
        }

        IMintable(vlp).burn(msg.sender, _vlpAmount);

        uint256 usdAmount = (_vlpAmount * totalUSD) / totalVLP;
        uint256 unstakingFee = (usdAmount * settingsManager.unstakingFee(_tokenOut)) / BASIS_POINTS_DIVISOR;

        _distributeFee(unstakingFee, address(0), address(0));

        totalUSD -= usdAmount;
        uint256 tokenAmountOut = priceManager.usdToToken(_tokenOut, usdAmount - unstakingFee);
        IERC20Upgradeable(_tokenOut).safeTransfer(msg.sender, tokenAmountOut);

        emit Unstake(msg.sender, _tokenOut, _vlpAmount, tokenAmountOut);
    }

    function unstakeUSDC(uint256 _vlpAmount) external {
        unstake(address(USDC), _vlpAmount);
    }

    function unstakeAllUSDC() external {
        unstake(address(USDC), IERC20Upgradeable(vlp).balanceOf(msg.sender));
    }

    // submit order to create a new position
    function newPositionOrder(
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
    ) public payable nonReentrant preventBanners(msg.sender) {
        if (_orderType == OrderType.MARKET) {
            require(msg.value == settingsManager.marketOrderGasFee(), "invalid marketOrderGasFee");
        } else {
            require(msg.value == settingsManager.triggerGasFee(), "invalid triggerGasFee");
        }
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");
        require(_refer != msg.sender, "Refer error");
        positionVault.newPositionOrder(msg.sender, _tokenId, _isLong, _orderType, _params, _refer);
    }

    function newPositionOrderPacked(uint256 a, uint256 b, uint256 c) external payable {
        uint256 tokenId = a / 2 ** 240; //16 bits for tokenId
        uint256 tmp = (a % 2 ** 240) / 2 ** 232;
        bool isLong = tmp / 2 ** 7 == 1; // 1 bit for isLong
        OrderType orderType = OrderType(tmp % 2 ** 7); // 7 bits for orderType
        address refer = address(uint160(a)); //last 160 bit for refer
        uint256[] memory params = new uint256[](4);
        params[0] = b / 2 ** 128; //price
        params[1] = b % 2 ** 128; //price
        params[2] = c / 2 ** 128; //collateral
        params[3] = c % 2 ** 128; //size
        newPositionOrder(tokenId, isLong, orderType, params, refer);
    }

    // submit order to create a new position with take profit / stop loss orders
    function newPositionOrderWithTPSL(
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
        address _refer,
        bool[] memory _isTPs,
        uint256[] memory _prices,
        uint256[] memory _amountPercents
    ) external payable nonReentrant preventBanners(msg.sender) {
        if (_orderType == OrderType.MARKET) {
            require(
                msg.value == settingsManager.marketOrderGasFee() + _prices.length * settingsManager.triggerGasFee(),
                "invalid marketOrderGasFee"
            );
        } else {
            require(msg.value == (_prices.length + 1) * settingsManager.triggerGasFee(), "invalid triggerGasFee");
        }
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");
        require(_refer != msg.sender, "Refer error");
        positionVault.newPositionOrder(msg.sender, _tokenId, _isLong, _orderType, _params, _refer);
        orderVault.addTriggerOrders(positionVault.lastPosId() - 1, msg.sender, _isTPs, _prices, _amountPercents);
    }

    // submit market order to increase size of exisiting position
    function addPosition(
        uint256 _posId,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        uint256 _allowedPrice
    ) public payable nonReentrant preventBanners(msg.sender) {
        require(msg.value == settingsManager.marketOrderGasFee(), "invalid triggerGasFee");
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");

        positionVault.createAddPositionOrder(msg.sender, _posId, _collateralDelta, _sizeDelta, _allowedPrice);
    }

    function addPositionPacked(uint256 a, uint256 b) external payable {
        uint256 posId = a / 2 ** 128;
        uint256 collateralDelta = a % 2 ** 128;
        uint256 sizeDelta = b / 2 ** 128;
        uint256 allowedPrice = b % 2 ** 128;
        addPosition(posId, collateralDelta, sizeDelta, allowedPrice);
    }

    // add collateral to reduce leverage
    function addCollateral(uint256 _posId, uint256 _amount) public nonReentrant preventBanners(msg.sender) {
        positionVault.addOrRemoveCollateral(msg.sender, _posId, true, _amount);
    }

    // remove collateral to increase leverage
    function removeCollateral(uint256 _posId, uint256 _amount) public payable nonReentrant preventBanners(msg.sender) {
        require(msg.value == settingsManager.marketOrderGasFee(), "invalid triggerGasFee");
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");

        positionVault.addOrRemoveCollateral(msg.sender, _posId, false, _amount);
    }

    function addOrRemoveCollateralPacked(uint256 a) external {
        uint256 posId = a >> 128;
        bool isPlus = (a >> 127) % 2 == 1;
        uint256 amount = a % 2 ** 127;
        if (isPlus) {
            return addCollateral(posId, amount);
        } else {
            return removeCollateral(posId, amount);
        }
    }

    // submit market order to decrease size of exisiting position
    function decreasePosition(
        uint256 _sizeDelta,
        uint256 _allowedPrice,
        uint256 _posId
    ) public payable nonReentrant preventBanners(msg.sender) {
        require(msg.value == settingsManager.marketOrderGasFee(), "invalid marketOrderGasFee");
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");

        positionVault.createDecreasePositionOrder(_posId, msg.sender, _sizeDelta, _allowedPrice);
    }

    function decreasePositionPacked(uint256 a, uint256 _posId) external payable {
        uint256 sizeDelta = a / 2 ** 128;
        uint256 allowedPrice = a % 2 ** 128;
        return decreasePosition(sizeDelta, allowedPrice, _posId);
    }

    function addTPSL(
        uint256 _posId,
        bool[] memory _isTPs,
        uint256[] memory _prices,
        uint256[] memory _amountPercents
    ) public payable nonReentrant preventBanners(msg.sender) {
        require(msg.value == settingsManager.triggerGasFee() * _prices.length, "invalid triggerGasFee");
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");

        orderVault.addTriggerOrders(_posId, msg.sender, _isTPs, _prices, _amountPercents);
    }

    function addTPSLPacked(uint256 a, uint256[] calldata _tps) external payable {
        uint256 posId = a / 2 ** 128;
        uint256 length = _tps.length;
        bool[] memory isTPs = new bool[](length);
        uint256[] memory prices = new uint256[](length);
        uint256[] memory amountPercents = new uint256[](length);
        for (uint i; i < length; ++i) {
            prices[i] = _tps[i] / 2 ** 128;
            isTPs[i] = (_tps[i] / 2 ** 127) % 2 == 1;
            amountPercents[i] = _tps[i] % 2 ** 127;
        }
        addTPSL(posId, isTPs, prices, amountPercents);
    }

    // submit trailing stop order to decrease size of exisiting position
    function addTrailingStop(
        uint256 _posId,
        uint256[] memory _params
    ) external payable nonReentrant preventBanners(msg.sender) {
        require(msg.value == settingsManager.triggerGasFee(), "invalid triggerGasFee");
        (bool success, ) = payable(settingsManager.feeManager()).call{value: msg.value}("");
        require(success, "failed to send fee");

        orderVault.addTrailingStop(msg.sender, _posId, _params);
    }

    // cancel pending newPositionOrder / trailingStopOrder
    function cancelPendingOrder(uint256 _posId) public nonReentrant preventBanners(msg.sender) {
        orderVault.cancelPendingOrder(msg.sender, _posId);
    }

    // cancel multiple pending newPositionOrder / trailingStopOrder
    function cancelPendingOrders(uint256[] memory _posIds) external preventBanners(msg.sender) {
        for (uint i = 0; i < _posIds.length; ++i) {
            orderVault.cancelPendingOrder(msg.sender, _posIds[i]);
        }
    }

    function setPlatformUsed(address _platform) external {
        platformUsed[msg.sender] = _platform;
    }

    /* ========== HELPER FUNCTIONS ========== */

    // account trader's profit / loss into vault
    function accountDeltaIntoTotalUSD(bool _isIncrease, uint256 _delta) external override onlyVault {
        if (_delta > 0) {
            if (_isIncrease) {
                totalUSD += _delta;
            } else {
                require(totalUSD >= _delta, "exceeded VLP bottom");
                totalUSD -= _delta;
            }
        }
    }

    function distributeFee(uint256 _fee, address _refer, address _trader) external override onlyVault {
        _distributeFee(_fee, _refer, _trader);
    }

    // to distribute fee among referrer, vault and feeManager
    function _distributeFee(uint256 _fee, address _refer, address _trader) internal {
        if (_fee > 0) {
            if (_refer != address(0)) {
                (uint256 referFee, uint256 traderRebate) = settingsManager.getReferFeeAndTraderRebate(_refer);
                referFee = (_fee * referFee) / BASIS_POINTS_DIVISOR;
                traderRebate = (_fee * traderRebate) / BASIS_POINTS_DIVISOR;

                IVUSD(vusd).mint(_refer, referFee);
                if (traderRebate > 0) IVUSD(vusd).mint(_trader, traderRebate);

                _fee -= referFee + traderRebate;
                emit ReferFeeTraderRebate(_refer, referFee, _trader, traderRebate);
            }

            if (_trader != address(0)) {
                address platform = platformUsed[_trader];
                uint256 platformFee = settingsManager.platformFees(platform);
                if (platformFee > 0) {
                    platformFee = (_fee * platformFee) / BASIS_POINTS_DIVISOR;

                    IVUSD(vusd).mint(platform, platformFee);

                    _fee -= platformFee;
                    emit PlatformFeeTransfer(platform, platformFee, _trader);
                }
            }

            uint256 feeForVLP = (_fee * settingsManager.feeRewardBasisPoints()) / BASIS_POINTS_DIVISOR;
            totalUSD += feeForVLP;
            IVUSD(vusd).mint(settingsManager.feeManager(), _fee - feeForVLP);
        }
    }

    function takeVUSDIn(address _account, uint256 _amount) external override onlyVault {
        IVUSD(vusd).burn(_account, _amount);
    }

    function takeVUSDOut(address _account, uint256 _amount) external override onlyVault {
        IVUSD(vusd).mint(_account, _amount);
    }

    /* ========== OPERATOR FUNCTIONS ========== */

    // allow admin to force close a user's position if the position profit > max profit % of totalUSD
    function forceClosePosition(uint256 _posId) external payable nonReentrant onlyOperator(1) {
        Position memory position = positionVault.getPosition(_posId);
        uint256 price = priceManager.getLastPrice(position.tokenId);
        (int256 pnl, , ) = settingsManager.getPnl(
            position.tokenId,
            position.isLong,
            position.size,
            position.averagePrice,
            price,
            position.lastIncreasedTime,
            position.accruedBorrowFee,
            position.fundingIndex
        );
        uint256 _maxProfitPercent = settingsManager.maxProfitPercent(position.tokenId) == 0
            ? settingsManager.defaultMaxProfitPercent()
            : settingsManager.maxProfitPercent(position.tokenId);
        uint256 maxPnl = (totalUSD * _maxProfitPercent) / BASIS_POINTS_DIVISOR;
        require(pnl > int256(maxPnl), "not allowed");
        positionVault.decreasePosition(_posId, price, position.size);
        uint256 exceededPnl = uint256(pnl) - maxPnl;
        IVUSD(vusd).burn(position.owner, exceededPnl); // cap user's pnl to maxPnl
        totalUSD += exceededPnl; // send pnl back to vault
        emit ForceClose(_posId, position.owner, exceededPnl);
    }

    /* ========== VIEW FUNCTIONS ========== */

    function getVLPPrice() external view returns (uint256) {
        uint256 totalVLP = IERC20Upgradeable(vlp).totalSupply();
        if (totalVLP == 0) {
            return DEFAULT_VLP_PRICE;
        } else {
            return (BASIS_POINTS_DIVISOR * (10 ** VLP_DECIMALS) * totalUSD) / (totalVLP * PRICE_PRECISION);
        }
    }

    function getVaultUSDBalance() external view override returns (uint256) {
        return totalUSD;
    }
}