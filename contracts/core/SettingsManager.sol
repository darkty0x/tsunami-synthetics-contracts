// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/ISettingsManager.sol";
import "./interfaces/ILiquidateVault.sol";
import "./interfaces/IPositionVault.sol";
import "./interfaces/IOperators.sol";
import "../staking/interfaces/ITokenFarm.sol";
import "../tokens/interfaces/IVUSD.sol";
import {Constants} from "../access/Constants.sol";

contract SettingsManager is ISettingsManager, Initializable, ReentrancyGuardUpgradeable, Constants {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // constants
    ILiquidateVault public liquidateVault;
    IPositionVault public positionVault;
    ITokenFarm public tokenFarm;
    IOperators public operators;
    address public vusd;

    /* ========== VAULT SETTINGS ========== */
    uint256 public override cooldownDuration;
    mapping(address => bool) public override isWhitelistedFromCooldown;
    uint256 public override feeRewardBasisPoints;
    address public override feeManager;
    uint256 public override defaultMaxProfitPercent;

    event SetCooldownDuration(uint256 cooldownDuration);
    event SetIsWhitelistedFromCooldown(address addr, bool isWhitelisted);
    event SetIsWhitelistedFromTransferCooldown(address addr, bool isWhitelisted);
    event SetFeeRewardBasisPoints(uint256 feeRewardBasisPoints);
    event SetFeeManager(address indexed feeManager);
    event SetDefaultMaxProfitPercent(uint256 defaultMaxProfitPercent);
    event SetMaxProfitPercent(uint256 tokenId, uint256 maxProfitPercent);
    event SetMaxTotalVlp(uint256 maxTotalVlp);

    /* ========== VAULT SWITCH ========== */
    mapping(address => bool) public override isDeposit;
    mapping(address => bool) public override isWithdraw;
    mapping(address => bool) public override isStakingEnabled;
    mapping(address => bool) public override isUnstakingEnabled;

    event SetEnableDeposit(address indexed token, bool isEnabled);
    event SetEnableWithdraw(address indexed token, bool isEnabled);
    event SetEnableStaking(address indexed token, bool isEnabled);
    event SetEnableUnstaking(address indexed token, bool isEnabled);

    /* ========== VAULT FEE ========== */
    mapping(address => uint256) public override depositFee;
    mapping(address => uint256) public override withdrawFee;
    mapping(address => uint256) public override stakingFee;
    mapping(address => uint256) public override unstakingFee;

    event SetDepositFee(address indexed token, uint256 indexed fee);
    event SetWithdrawFee(address indexed token, uint256 indexed fee);
    event SetStakingFee(address indexed token, uint256 indexed fee);
    event SetUnstakingFee(address indexed token, uint256 indexed fee);

    /* ========== TRADING FEE ========== */
    mapping(uint256 => mapping(bool => uint256)) public override tradingFee; // 100 = 0.1%
    mapping(address => uint256) public override deductFeePercent;

    event SetTradingFee(uint256 indexed tokenId, bool isLong, uint256 tradingFee);
    event SetDeductFeePercent(address indexed account, uint256 deductFee);

    /* ========== FUNDING FEE ========== */
    uint256 public override basisFundingRateFactor;
    mapping(uint256 => uint256) public override fundingRateFactor;
    uint256 public override maxFundingRate;

    event SetBasisFundingRateFactor(uint256 basisFundingRateFactor);
    event SetFundingRateFactor(uint256 indexed tokenId, uint256 fundingRateFactor);
    event SetMaxFundingRate(uint256 maxFundingRateFactor);

    event SetVolatilityFactor(uint256 indexed tokenId, uint256 volatilityFactor);
    event SetLongBiasFactor(uint256 indexed tokenId, uint256 longBiasFactor);
    event SetFundingRateVelocityFactor(uint256 indexed tokenId, uint256 fundingRateVelocityFactor);
    event SetTempMaxFundingRateFactor(uint256 indexed tokenId, uint256 tempMaxFundingRateFactor);

    mapping(uint256 => int256) public override fundingIndex;
    mapping(uint256 => uint256) public override lastFundingTimes;

    event UpdateFunding(uint256 indexed tokenId, int256 fundingIndex);

    /* ========== BORROW FEE ========== */
    uint256 public override defaultBorrowFeeFactor; // deprecated
    mapping(uint256 => uint256) public override borrowFeeFactor; // deprecated

    event SetBorrowFeeFactorPerAssetPerSide(uint256 tokenId, bool isLong, uint256 borrowFeeFactor);

    /* ========== REFER FEE ========== */
    mapping(address => uint256) public override referrerTiers;
    mapping(uint256 => uint256) public override tierFees;

    event SetReferrerTier(address referrer, uint256 tier);
    event SetTierFee(uint256 tier, uint256 fee);
    event SetTierRebate(uint256 tier, uint256 rebate);
    event SetPlatformFee(address platform, uint256 fee);

    /* ========== INCREASE/DECREASE POSITION ========== */
    mapping(uint256 => bool) public override isIncreasingPositionDisabled;
    mapping(uint256 => bool) public override isDecreasingPositionDisabled;
    uint256 public override minCollateral;
    uint256 public override closeDeltaTime;

    event SetIsIncreasingPositionDisabled(uint256 tokenId, bool isDisabled);
    event SetIsDecreasingPositionDisabled(uint256 tokenId, bool isDisabled);
    event SetMinCollateral(uint256 minCollateral);
    event SetCloseDeltaTime(uint256 deltaTime);
    event SetMinProfitDuration(uint256 tokenId, uint256 minProfitDuration);
    event SetMaxCloseProfit(uint256 tokenId, uint256 maxCloseProfit);
    event SetMaxCloseProfitPercent(uint256 tokenId, uint256 maxCloseProfitPercent);

    /* ========== OPEN INTEREST MECHANISM ========== */
    uint256 public defaultMaxOpenInterestPerUser;
    mapping(address => uint256) public maxOpenInterestPerUser;
    mapping(uint256 => mapping(bool => uint256)) public maxOpenInterestPerAssetPerSide;

    event SetDefaultMaxOpenInterestPerUser(uint256 maxOIAmount);
    event SetMaxOpenInterestPerUser(address indexed account, uint256 maxOIAmount);
    event SetMaxOpenInterestPerAssetPerSide(uint256 indexed tokenId, bool isLong, uint256 maxOIAmount);
    event SetMaxTotalOpenInterest(uint256 maxOIAmount);

    mapping(address => uint256) public override openInterestPerUser;
    mapping(uint256 => mapping(bool => uint256)) public override openInterestPerAssetPerSide;
    uint256 public override totalOpenInterest;

    event IncreaseOpenInterest(uint256 indexed id, bool isLong, uint256 amount);
    event DecreaseOpenInterest(uint256 indexed id, bool isLong, uint256 amount);

    /* ========== MARKET ORDER ========== */
    uint256 public override marketOrderGasFee;
    uint256 public override expiryDuration;
    uint256 public override selfExecuteCooldown;

    event SetMarketOrderGasFee(uint256 indexed fee);
    event SetExpiryDuration(uint256 expiryDuration);
    event SetSelfExecuteCooldown(uint256 selfExecuteCooldown);

    /* ========== TRIGGER ORDER ========== */
    uint256 public override triggerGasFee;
    uint256 public override maxTriggerPerPosition;
    uint256 public override priceMovementPercent;

    event SetTriggerGasFee(uint256 indexed fee);
    event SetMaxTriggerPerPosition(uint256 value);
    event SetPriceMovementPercent(uint256 priceMovementPercent);

    /* ========== ARTIFICIAL SLIPPAGE MECHANISM ========== */
    mapping(uint256 => uint256) public override slippageFactor;

    event SetSlippageFactor(uint256 indexed tokenId, uint256 slippageFactor);

    /* ========== LIQUIDATE MECHANISM ========== */
    mapping(uint256 => uint256) public liquidateThreshold;
    uint256 public override liquidationPendingTime;
    uint256 private unused; // removal of liquidationFee
    struct BountyPercent {
        uint32 firstCaller;
        uint32 resolver;
    } // pack to save gas
    BountyPercent private bountyPercent_;

    event SetLiquidateThreshold(uint256 indexed tokenId, uint256 newThreshold);
    event SetLiquidationPendingTime(uint256 liquidationPendingTime);
    event SetBountyPercent(uint32 bountyPercentFirstCaller, uint32 bountyPercentResolver);

    /* ========== DELEGATE MECHANISM========== */
    mapping(address => EnumerableSetUpgradeable.AddressSet) private _delegatesByMaster;
    mapping(address => bool) public globalDelegates; // treat these addrs already be delegated

    event GlobalDelegatesChange(address indexed delegate, bool allowed);

    /* ========== BAN MECHANISM========== */
    EnumerableSetUpgradeable.AddressSet private banWalletList;

    /* new variables */
    mapping(address => bool) public override isWhitelistedFromTransferCooldown;
    mapping(uint256 => uint256) public override maxProfitPercent;
    uint256 public maxTotalOpenInterest;
    mapping(uint256 => mapping(bool => uint256)) public borrowFeeFactorPerAssetPerSide;
    mapping(uint256 => uint256) public tierRebates; // tier => rebate percent for trader
    mapping(address => uint256) public override platformFees; // address of 3rd platform to receive platform fee => fee percent
    uint256 public override maxTotalVlp;

    mapping(uint256 => uint256) public override minProfitDurations; // tokenId => minProfitDuration
    mapping(uint256 => uint256) public override maxCloseProfits; // tokenId => maxCloseProfit
    mapping(uint256 => uint256) public override maxCloseProfitPercents; // tokenId => maxCloseProfitPercent

    mapping(uint256 => int256) public override lastFundingRates; // tokenId => last updated funding rate
    mapping(uint256 => uint256) public override volatilityFactors; // tokenId => volatilityFactor
    mapping(uint256 => uint256) public override longBiasFactors; // tokenId => longBiasFactors
    mapping(uint256 => uint256) public override fundingRateVelocityFactors; // tokenId => fundingRateVelocityFactor
    mapping(uint256 => uint256) public override tempMaxFundingRateFactors; // tokenId => tempMaxFundingRateFactor

    /* ========== MODIFIERS ========== */
    modifier onlyVault() {
        require(msg.sender == address(positionVault) || msg.sender == address(liquidateVault), "Only vault");
        _;
    }

    modifier onlyOperator(uint256 level) {
        _onlyOperator(level);
        _;
    }

    function _onlyOperator(uint256 level) private view {
        require(operators.getOperatorLevel(msg.sender) >= level, "invalid operator");
    }

    /* ========== INITIALIZE FUNCTION========== */
    function initialize(
        address _liquidateVault,
        address _positionVault,
        address _operators,
        address _vusd,
        address _tokenFarm
    ) public initializer {
        __ReentrancyGuard_init();
        liquidateVault = ILiquidateVault(_liquidateVault);
        positionVault = IPositionVault(_positionVault);
        operators = IOperators(_operators);
        tokenFarm = ITokenFarm(_tokenFarm);
        vusd = _vusd;
        priceMovementPercent = 50; // 0.05%
        defaultMaxProfitPercent = 10000; // 10%
        bountyPercent_ = BountyPercent({firstCaller: 20000, resolver: 50000}); // first caller 20%, resolver 50% and leftover to team
        liquidationPendingTime = 10; // allow 10 seconds for manager to resolve liquidation
        cooldownDuration = 3 hours;
        expiryDuration = 60; // 60 seconds
        selfExecuteCooldown = 60; // 60 seconds
        feeRewardBasisPoints = 50000; // 50%
        minCollateral = 5 * PRICE_PRECISION; // min 5 USD
        defaultBorrowFeeFactor = 10; // 0.01% per hour
        triggerGasFee = 0; //100 gwei;
        marketOrderGasFee = 0;
        basisFundingRateFactor = 10000;
        tierFees[0] = 5000; // 5% refer fee for default tier
        maxTriggerPerPosition = 10;
        defaultMaxOpenInterestPerUser = 10000000000000000 * PRICE_PRECISION;
        maxFundingRate = FUNDING_RATE_PRECISION / 100; // 1% per hour
        maxTotalOpenInterest = 10000000000 * PRICE_PRECISION;
        unused = 10000; // 10%
        maxTotalVlp = 20 * 10 ** 6 * 10 ** VLP_DECIMALS; // 20mil max vlp supply
    }

    function initializeV2() public reinitializer(2) {
        bountyPercent_ = BountyPercent({firstCaller: 2000, resolver: 8000}); // first caller 2%, resolver 8% and leftover 90% to vlp
    }

    function initializeV3() public reinitializer(3) {
        maxTotalOpenInterest = 10000000000 * PRICE_PRECISION;
        defaultBorrowFeeFactor = 100; // 0.01% per hour
    }

    /* ========== VAULT SETTINGS ========== */
    /* OP FUNCTIONS */
    function setCooldownDuration(uint256 _cooldownDuration) external onlyOperator(3) {
        require(_cooldownDuration <= MAX_COOLDOWN_DURATION, "invalid cooldownDuration");
        cooldownDuration = _cooldownDuration;
        emit SetCooldownDuration(_cooldownDuration);
    }

    function setIsWhitelistedFromCooldown(address _addr, bool _isWhitelisted) external onlyOperator(3) {
        isWhitelistedFromCooldown[_addr] = _isWhitelisted;
        emit SetIsWhitelistedFromCooldown(_addr, _isWhitelisted);
    }

    function setIsWhitelistedFromTransferCooldown(address _addr, bool _isWhitelisted) external onlyOperator(3) {
        isWhitelistedFromTransferCooldown[_addr] = _isWhitelisted;
        emit SetIsWhitelistedFromTransferCooldown(_addr, _isWhitelisted);
    }

    function setFeeRewardBasisPoints(uint256 _feeRewardsBasisPoints) external onlyOperator(3) {
        require(_feeRewardsBasisPoints <= BASIS_POINTS_DIVISOR, "Above max");
        feeRewardBasisPoints = _feeRewardsBasisPoints;
        emit SetFeeRewardBasisPoints(_feeRewardsBasisPoints);
    }

    function setFeeManager(address _feeManager) external onlyOperator(3) {
        feeManager = _feeManager;
        emit SetFeeManager(_feeManager);
    }

    function setDefaultMaxProfitPercent(uint256 _defaultMaxProfitPercent) external onlyOperator(3) {
        defaultMaxProfitPercent = _defaultMaxProfitPercent;
        emit SetDefaultMaxProfitPercent(_defaultMaxProfitPercent);
    }

    function setMaxProfitPercent(uint256 _tokenId, uint256 _maxProfitPercent) external onlyOperator(3) {
        maxProfitPercent[_tokenId] = _maxProfitPercent;
        emit SetMaxProfitPercent(_tokenId, _maxProfitPercent);
    }

    function setMaxTotalVlp(uint256 _maxTotalVlp) external onlyOperator(3) {
        require(_maxTotalVlp > 0, "invalid maxTotalVlp");
        maxTotalVlp = _maxTotalVlp;
        emit SetMaxTotalVlp(_maxTotalVlp);
    }

    /* ========== VAULT SWITCH ========== */
    /* OP FUNCTIONS */
    function setEnableDeposit(address _token, bool _isEnabled) external onlyOperator(3) {
        isDeposit[_token] = _isEnabled;
        emit SetEnableDeposit(_token, _isEnabled);
    }

    function setEnableWithdraw(address _token, bool _isEnabled) external onlyOperator(3) {
        isWithdraw[_token] = _isEnabled;
        emit SetEnableWithdraw(_token, _isEnabled);
    }

    function setEnableStaking(address _token, bool _isEnabled) external onlyOperator(3) {
        isStakingEnabled[_token] = _isEnabled;
        emit SetEnableStaking(_token, _isEnabled);
    }

    function setEnableUnstaking(address _token, bool _isEnabled) external onlyOperator(3) {
        isUnstakingEnabled[_token] = _isEnabled;
        emit SetEnableUnstaking(_token, _isEnabled);
    }

    /* ========== VAULT FEE ========== */
    /* OP FUNCTIONS */
    function setDepositFee(address token, uint256 _fee) external onlyOperator(3) {
        require(_fee <= MAX_DEPOSIT_WITHDRAW_FEE, "Above max");
        depositFee[token] = _fee;
        emit SetDepositFee(token, _fee);
    }

    function setWithdrawFee(address token, uint256 _fee) external onlyOperator(3) {
        require(_fee <= MAX_DEPOSIT_WITHDRAW_FEE, "Above max");
        withdrawFee[token] = _fee;
        emit SetWithdrawFee(token, _fee);
    }

    function setStakingFee(address token, uint256 _fee) external onlyOperator(3) {
        require(_fee <= MAX_STAKING_UNSTAKING_FEE, "Above max");
        stakingFee[token] = _fee;
        emit SetStakingFee(token, _fee);
    }

    function setUnstakingFee(address token, uint256 _fee) external onlyOperator(3) {
        require(_fee <= MAX_STAKING_UNSTAKING_FEE, "Above max");
        unstakingFee[token] = _fee;
        emit SetUnstakingFee(token, _fee);
    }

    /* ========== TRADING FEE ========== */
    /* OP FUNCTIONS */
    function setTradingFee(uint256 _tokenId, bool _isLong, uint256 _tradingFee) external onlyOperator(3) {
        require(_tradingFee <= MAX_FEE_BASIS_POINTS, "Above max");
        tradingFee[_tokenId][_isLong] = _tradingFee;
        emit SetTradingFee(_tokenId, _isLong, _tradingFee);
    }

    function setDeductFeePercentForUser(address _account, uint256 _deductFee) external onlyOperator(2) {
        require(_deductFee <= BASIS_POINTS_DIVISOR, "Above max");
        deductFeePercent[_account] = _deductFee;
        emit SetDeductFeePercent(_account, _deductFee);
    }

    /* VIEW FUNCTIONS */
    function getTradingFee(
        address _account,
        uint256 _tokenId,
        bool _isLong,
        uint256 _sizeDelta
    ) external view override returns (uint256) {
        return
            (getUndiscountedTradingFee(_tokenId, _isLong, _sizeDelta) *
                (BASIS_POINTS_DIVISOR - deductFeePercent[_account]) *
                tokenFarm.getTierVela(_account)) / BASIS_POINTS_DIVISOR ** 2;
    }

    function getUndiscountedTradingFee(
        uint256 _tokenId,
        bool _isLong,
        uint256 _sizeDelta
    ) public view override returns (uint256) {
        return (_sizeDelta * tradingFee[_tokenId][_isLong]) / BASIS_POINTS_DIVISOR;
    }

    /* ========== FUNDING FEE ========== */
    /* OP FUNCTIONS */
    function setBasisFundingRateFactor(uint256 _basisFundingRateFactor) external onlyOperator(3) {
        basisFundingRateFactor = _basisFundingRateFactor;
        emit SetBasisFundingRateFactor(_basisFundingRateFactor);
    }

    function setFundingRateFactor(uint256 _tokenId, uint256 _fundingRateFactor) external onlyOperator(3) {
        fundingRateFactor[_tokenId] = _fundingRateFactor;
        emit SetFundingRateFactor(_tokenId, _fundingRateFactor);
    }

    function setMaxFundingRate(uint256 _maxFundingRate) external onlyOperator(3) {
        require(_maxFundingRate <= MAX_FUNDING_RATE, "Above max");
        maxFundingRate = _maxFundingRate;
        emit SetMaxFundingRate(_maxFundingRate);
    }

    function setVolatilityFactor(uint256 _tokenId, uint256 _volatilityFactor) external onlyOperator(3) {
        volatilityFactors[_tokenId] = _volatilityFactor;
        emit SetVolatilityFactor(_tokenId, _volatilityFactor);
    }

    function setLongBiasFactor(uint256 _tokenId, uint256 _longBiasFactor) external onlyOperator(3) {
        longBiasFactors[_tokenId] = _longBiasFactor;
        emit SetLongBiasFactor(_tokenId, _longBiasFactor);
    }

    function setFundingRateVelocityFactor(
        uint256 _tokenId,
        uint256 _fundingRateVelocityFactor
    ) external onlyOperator(3) {
        fundingRateVelocityFactors[_tokenId] = _fundingRateVelocityFactor;
        emit SetFundingRateVelocityFactor(_tokenId, _fundingRateVelocityFactor);
    }

    function setTempMaxFundingRateFactor(uint256 _tokenId, uint256 _tempMaxFundingRateFactor) external onlyOperator(3) {
        tempMaxFundingRateFactors[_tokenId] = _tempMaxFundingRateFactor;
        emit SetTempMaxFundingRateFactor(_tokenId, _tempMaxFundingRateFactor);
    }

    /* VAULT FUNCTIONS */
    // to update the fundingIndex every time before open interest changes
    function updateFunding(uint256 _tokenId) external override {
        if (lastFundingTimes[_tokenId] == 0) {
            require(msg.sender == address(positionVault), "initialized by vault only"); // can be initialized by vault only
        } else {
            int256 fundingRate = getFundingRate(_tokenId);
            int256 latestFundingIndex = fundingIndex[_tokenId] + getFundingChange(_tokenId, fundingRate);
            fundingIndex[_tokenId] = latestFundingIndex;

            emit UpdateFunding(_tokenId, latestFundingIndex);

            lastFundingRates[_tokenId] = fundingRate;
        }

        lastFundingTimes[_tokenId] = block.timestamp;
    }

    /* VIEW FUNCTIONS */
    // calculate fundingFee based on fundingIndex difference
    function getFundingFee(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        int256 _fundingIndex
    ) public view override returns (int256) {
        return
            _isLong
                ? (int256(_size) * (getLatestFundingIndex(_tokenId) - _fundingIndex)) / int256(FUNDING_RATE_PRECISION)
                : (int256(_size) * (_fundingIndex - getLatestFundingIndex(_tokenId))) / int256(FUNDING_RATE_PRECISION);
    }

    // calculate latestFundingIndex based on fundingChange
    function getLatestFundingIndex(uint256 _tokenId) public view returns (int256) {
        int256 fundingRate = getFundingRate(_tokenId);
        return fundingIndex[_tokenId] + getFundingChange(_tokenId, fundingRate);
    }

    // calculate fundingChange based on fundingRate and period it has taken effect
    // averageFundingRate is used to calc fundingChange as the fundingRate slowly changes over time due to fundingRateVelocity
    function getFundingChange(uint256 _tokenId, int256 _fundingRate) private view returns (int256) {
        uint256 interval = block.timestamp - lastFundingTimes[_tokenId];
        if (interval == 0) return int256(0);

        int256 lastFundingRate = lastFundingRates[_tokenId];
        int256 averageFundingRate = (lastFundingRate + _fundingRate) / 2;

        return (averageFundingRate * int256(interval)) / int256(1 hours);
    }

    // get temporary max funding rate with 1e15 decimals
    function getTempMaxFundingRate(uint256 _tokenId) public view returns (uint256) {
        return (tempMaxFundingRateFactors[_tokenId] * volatilityFactors[_tokenId]) * BASIS_POINTS_DIVISOR;
    }

    // calculate funding rate per hour with 1e15 decimals
    function getFundingRate(uint256 _tokenId) public view override returns (int256) {
        uint256 interval = block.timestamp - lastFundingTimes[_tokenId];
        int256 fundingRate = lastFundingRates[_tokenId] +
            (int256(interval) * getFundingRateVelocity(_tokenId)) /
            int256(1 hours);

        uint256 tempMaxFundingRate = getTempMaxFundingRate(_tokenId);
        uint256 curMaxFundingRate = tempMaxFundingRate < maxFundingRate ? tempMaxFundingRate : maxFundingRate;

        if (fundingRate == 0) return 0;

        if (fundingRate > 0) {
            int256 _curMaxFundingRate = int256(curMaxFundingRate);
            if (fundingRate > _curMaxFundingRate) return _curMaxFundingRate;
        } else {
            int256 _curMaxFundingRate = -1 * int256(curMaxFundingRate);
            if (fundingRate < _curMaxFundingRate) return _curMaxFundingRate;
        }

        return fundingRate;
    }

    // calculate velocity for funding rate with 1e15 decimals
    function getFundingRateVelocity(uint256 _tokenId) public view returns (int256) {
        uint256 longOI = openInterestPerAssetPerSide[_tokenId][true];
        uint256 shortOI = openInterestPerAssetPerSide[_tokenId][false];
        uint256 limitOI = maxOpenInterestPerAssetPerSide[_tokenId][true] +
            maxOpenInterestPerAssetPerSide[_tokenId][false];
        if (limitOI == 0) return 0;

        // skewRatio = (longOI - shortOI) / limitOI
        int256 skewRatio = (int256(BASIS_POINTS_DIVISOR) * (int256(longOI) - int256(shortOI))) / int256(limitOI);

        int256 tempMaxFundingRate = int256(getTempMaxFundingRate(_tokenId));

        int256 fundingRateVelocityFactor = int256(fundingRateVelocityFactors[_tokenId]);
        if (fundingRateVelocityFactor == 0) return 0;

        // fundingRateVelocity = [tempMaxFundingRate * (skewRatio + longBias) - lastFundingRate] / fundingRateVelocityFactor
        return
            (tempMaxFundingRate *
                (skewRatio + int256(longBiasFactors[_tokenId])) -
                lastFundingRates[_tokenId] *
                int256(BASIS_POINTS_DIVISOR)) / fundingRateVelocityFactor;
    }

    /* ========== BORROW FEE ========== */
    /* OP FUNCTIONS */
    function setBorrowFeeFactorPerAssetPerSide(
        uint256 _tokenId,
        bool _isLong,
        uint256 _borrowFeeFactor
    ) external onlyOperator(3) {
        require(_borrowFeeFactor <= MAX_BORROW_FEE_FACTOR * 10, "Above max");
        borrowFeeFactorPerAssetPerSide[_tokenId][_isLong] = _borrowFeeFactor;
        emit SetBorrowFeeFactorPerAssetPerSide(_tokenId, _isLong, _borrowFeeFactor);
    }

    /* VIEW FUNCTIONS */
    function getBorrowFee(
        uint256 _borrowedSize,
        uint256 _lastIncreasedTime,
        uint256 _tokenId,
        bool _isLong
    ) public view override returns (uint256) {
        return
            ((block.timestamp - _lastIncreasedTime) * _borrowedSize * getBorrowRate(_tokenId, _isLong)) /
            (BASIS_POINTS_DIVISOR * 10) /
            1 hours;
    }

    // get borrow rate per hour with 1e6 decimals
    function getBorrowRate(uint256 _tokenId, bool _isLong) public view returns (uint256) {
        return borrowFeeFactorPerAssetPerSide[_tokenId][_isLong];
    }

    /* ========== REFER FEE ========== */
    /* OP FUNCTIONS */
    function setReferrerTier(address _referrer, uint256 _tier) external onlyOperator(1) {
        referrerTiers[_referrer] = _tier;
        emit SetReferrerTier(_referrer, _tier);
    }

    function setTierFee(uint256 _tier, uint256 _fee) external onlyOperator(3) {
        require(_fee + tierRebates[_tier] <= BASIS_POINTS_DIVISOR, "Above max");
        tierFees[_tier] = _fee;
        emit SetTierFee(_tier, _fee);
    }

    function setTierRebate(uint256 _tier, uint256 _rebate) external onlyOperator(3) {
        require(_rebate + tierFees[_tier] <= BASIS_POINTS_DIVISOR, "Above max");
        tierRebates[_tier] = _rebate;
        emit SetTierRebate(_tier, _rebate);
    }

    function setPlatformFee(address _platform, uint256 _fee) external onlyOperator(3) {
        require(_fee <= BASIS_POINTS_DIVISOR, "Above max");
        platformFees[_platform] = _fee;
        emit SetPlatformFee(_platform, _fee);
    }

    /* VIEW FUNCTIONS */
    function getReferFee(address _refer) external view override returns (uint256) {
        return tierFees[referrerTiers[_refer]];
    }

    function getTraderRebate(address _refer) external view returns (uint256) {
        return tierRebates[referrerTiers[_refer]];
    }

    function getReferFeeAndTraderRebate(
        address _refer
    ) external view override returns (uint256 referFee, uint256 traderRebate) {
        uint256 tier = referrerTiers[_refer];

        referFee = tierFees[tier];
        traderRebate = tierRebates[tier];
    }

    /* ========== INCREASE/DECREASE POSITION ========== */
    /* OP FUNCTIONS */
    function setIsIncreasingPositionDisabled(uint256 _tokenId, bool _isDisabled) external onlyOperator(2) {
        isIncreasingPositionDisabled[_tokenId] = _isDisabled;
        emit SetIsIncreasingPositionDisabled(_tokenId, _isDisabled);
    }

    function setIsDecreasingPositionDisabled(uint256 _tokenId, bool _isDisabled) external onlyOperator(2) {
        isDecreasingPositionDisabled[_tokenId] = _isDisabled;
        emit SetIsDecreasingPositionDisabled(_tokenId, _isDisabled);
    }

    function setMinCollateral(uint256 _minCollateral) external onlyOperator(3) {
        minCollateral = _minCollateral;
        emit SetMinCollateral(_minCollateral);
    }

    function setCloseDeltaTime(uint256 _deltaTime) external onlyOperator(2) {
        require(_deltaTime <= MAX_DELTA_TIME, "Above max");
        closeDeltaTime = _deltaTime;
        emit SetCloseDeltaTime(_deltaTime);
    }

    function setMinProfitDuration(uint256 _tokenId, uint256 _minProfitDuration) external onlyOperator(3) {
        minProfitDurations[_tokenId] = _minProfitDuration;
        emit SetMinProfitDuration(_tokenId, _minProfitDuration);
    }

    function setMaxCloseProfit(uint256 _tokenId, uint256 _maxCloseProfit) external onlyOperator(3) {
        maxCloseProfits[_tokenId] = _maxCloseProfit;
        emit SetMaxCloseProfit(_tokenId, _maxCloseProfit);
    }

    function setMaxCloseProfitPercent(uint256 _tokenId, uint256 _maxCloseProfitPercent) external onlyOperator(3) {
        maxCloseProfitPercents[_tokenId] = _maxCloseProfitPercent;
        emit SetMaxCloseProfitPercent(_tokenId, _maxCloseProfitPercent);
    }

    /* VIEW FUNCTIONS */
    function getPnl(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        uint256 _averagePrice,
        uint256 _lastPrice,
        uint256 _lastIncreasedTime,
        uint256 _accruedBorrowFee,
        int256 _fundingIndex
    ) external view override returns (int256 pnl, int256 fundingFee, int256 borrowFee) {
        require(_averagePrice > 0, "avgPrice > 0");

        if (_isLong) {
            if (_lastPrice >= _averagePrice) {
                pnl = int256((_size * (_lastPrice - _averagePrice)) / _averagePrice);
            } else {
                pnl = -1 * int256((_size * (_averagePrice - _lastPrice)) / _averagePrice);
            }
        } else {
            if (_lastPrice <= _averagePrice) {
                pnl = int256((_size * (_averagePrice - _lastPrice)) / _averagePrice);
            } else {
                pnl = -1 * int256((_size * (_lastPrice - _averagePrice)) / _averagePrice);
            }
        }

        fundingFee = getFundingFee(_tokenId, _isLong, _size, _fundingIndex);
        borrowFee = int256(getBorrowFee(_size, _lastIncreasedTime, _tokenId, _isLong) + _accruedBorrowFee);

        pnl = pnl - fundingFee - borrowFee;
    }

    /* ========== OPEN INTEREST MECHANISM ========== */
    /* OP FUNCTIONS */
    function setDefaultMaxOpenInterestPerUser(uint256 _maxAmount) external onlyOperator(1) {
        defaultMaxOpenInterestPerUser = _maxAmount;
        emit SetDefaultMaxOpenInterestPerUser(_maxAmount);
    }

    function setMaxOpenInterestPerUser(address _account, uint256 _maxAmount) external onlyOperator(2) {
        maxOpenInterestPerUser[_account] = _maxAmount;
        emit SetMaxOpenInterestPerUser(_account, _maxAmount);
    }

    function setMaxOpenInterestPerAsset(uint256 _tokenId, uint256 _maxAmount) external override onlyOperator(2) {
        setMaxOpenInterestPerAssetPerSide(_tokenId, true, _maxAmount);
        setMaxOpenInterestPerAssetPerSide(_tokenId, false, _maxAmount);
    }

    function setMaxOpenInterestPerAssetPerSide(
        uint256 _tokenId,
        bool _isLong,
        uint256 _maxAmount
    ) public onlyOperator(2) {
        maxOpenInterestPerAssetPerSide[_tokenId][_isLong] = _maxAmount;
        emit SetMaxOpenInterestPerAssetPerSide(_tokenId, _isLong, _maxAmount);
    }

    function setMaxTotalOpenInterest(uint256 _maxAmount) external onlyOperator(2) {
        maxTotalOpenInterest = _maxAmount;
        emit SetMaxTotalOpenInterest(_maxAmount);
    }

    /* VAULT FUNCTIONS */
    function increaseOpenInterest(
        uint256 _tokenId,
        address _sender,
        bool _isLong,
        uint256 _amount
    ) external override onlyVault {
        // check and increase openInterestPerUser
        uint256 _openInterestPerUser = openInterestPerUser[_sender];
        uint256 _maxOpenInterestPerUser = maxOpenInterestPerUser[_sender];
        if (_maxOpenInterestPerUser == 0) _maxOpenInterestPerUser = defaultMaxOpenInterestPerUser;
        require(_openInterestPerUser + _amount <= _maxOpenInterestPerUser, "user maxOI exceeded");
        openInterestPerUser[_sender] = _openInterestPerUser + _amount;

        // check and increase openInterestPerAssetPerSide
        uint256 _openInterestPerAssetPerSide = openInterestPerAssetPerSide[_tokenId][_isLong];
        require(
            _openInterestPerAssetPerSide + _amount <= maxOpenInterestPerAssetPerSide[_tokenId][_isLong],
            "asset side maxOI exceeded"
        );
        openInterestPerAssetPerSide[_tokenId][_isLong] = _openInterestPerAssetPerSide + _amount;

        // check and increase totalOpenInterest
        uint256 _totalOpenInterest = totalOpenInterest + _amount;
        require(_totalOpenInterest <= maxTotalOpenInterest, "maxTotalOpenInterest exceeded");
        totalOpenInterest = _totalOpenInterest;

        emit IncreaseOpenInterest(_tokenId, _isLong, _amount);
    }

    function decreaseOpenInterest(
        uint256 _tokenId,
        address _sender,
        bool _isLong,
        uint256 _amount
    ) external override onlyVault {
        uint256 _openInterestPerUser = openInterestPerUser[_sender];
        if (_openInterestPerUser < _amount) {
            openInterestPerUser[_sender] = 0;
        } else {
            openInterestPerUser[_sender] = _openInterestPerUser - _amount;
        }

        uint256 _openInterestPerAssetPerSide = openInterestPerAssetPerSide[_tokenId][_isLong];
        if (_openInterestPerAssetPerSide < _amount) {
            openInterestPerAssetPerSide[_tokenId][_isLong] = 0;
        } else {
            openInterestPerAssetPerSide[_tokenId][_isLong] = _openInterestPerAssetPerSide - _amount;
        }

        uint256 _totalOpenInterest = totalOpenInterest;
        if (_totalOpenInterest < _amount) {
            totalOpenInterest = 0;
        } else {
            totalOpenInterest = _totalOpenInterest - _amount;
        }

        emit DecreaseOpenInterest(_tokenId, _isLong, _amount);
    }

    /* ========== MARKET ORDER ========== */
    /* OP FUNCTIONS */
    function setMarketOrderGasFee(uint256 _fee) external onlyOperator(3) {
        require(_fee <= MAX_MARKET_ORDER_GAS_FEE, "Above max");
        marketOrderGasFee = _fee;
        emit SetMarketOrderGasFee(_fee);
    }

    function setExpiryDuration(uint256 _expiryDuration) external onlyOperator(3) {
        require(_expiryDuration <= MAX_EXPIRY_DURATION, "Above max");
        expiryDuration = _expiryDuration;
        emit SetExpiryDuration(_expiryDuration);
    }

    function setSelfExecuteCooldown(uint256 _selfExecuteCooldown) external onlyOperator(3) {
        require(_selfExecuteCooldown <= MAX_SELF_EXECUTE_COOLDOWN, "Above max");
        selfExecuteCooldown = _selfExecuteCooldown;
        emit SetSelfExecuteCooldown(_selfExecuteCooldown);
    }

    /* ========== TRIGGER ORDER ========== */
    /* OP FUNCTIONS */
    function setTriggerGasFee(uint256 _fee) external onlyOperator(3) {
        require(_fee <= MAX_TRIGGER_GAS_FEE, "Above max");
        triggerGasFee = _fee;
        emit SetTriggerGasFee(_fee);
    }

    function setMaxTriggerPerPosition(uint256 _value) external onlyOperator(3) {
        maxTriggerPerPosition = _value;
        emit SetMaxTriggerPerPosition(_value);
    }

    function setPriceMovementPercent(uint256 _priceMovementPercent) external onlyOperator(3) {
        require(_priceMovementPercent <= MAX_PRICE_MOVEMENT_PERCENT, "Above max");
        priceMovementPercent = _priceMovementPercent;
        emit SetPriceMovementPercent(_priceMovementPercent);
    }

    /* ========== ARTIFICIAL SLIPPAGE MECHANISM ========== */
    /* OP FUNCTIONS */
    function setSlippageFactor(uint256 _tokenId, uint256 _slippageFactor) external onlyOperator(3) {
        require(_slippageFactor <= BASIS_POINTS_DIVISOR, "Above max");
        slippageFactor[_tokenId] = _slippageFactor;
        emit SetSlippageFactor(_tokenId, _slippageFactor);
    }

    /* VIEW FUNCTIONS */
    function getPriceWithSlippage(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        uint256 _price
    ) external view override returns (uint256) {
        uint256 _slippageFactor = slippageFactor[_tokenId];

        if (_slippageFactor == 0) return _price;

        uint256 slippage = getSlippage(_slippageFactor, _size);

        return
            _isLong
                ? (_price * (BASIS_POINTS_DIVISOR + slippage)) / BASIS_POINTS_DIVISOR
                : (_price * (BASIS_POINTS_DIVISOR - slippage)) / BASIS_POINTS_DIVISOR;
    }

    function getSlippage(uint256 _slippageFactor, uint256 _size) public view returns (uint256) {
        return (_slippageFactor * (2 * totalOpenInterest + _size)) / (2 * positionVault.getVaultUSDBalance());
    }

    /* ========== LIQUIDATE MECHANISM ========== */
    /* OP FUNCTIONS */
    // the liquidateThreshold should range between 80% to 100%
    function setLiquidateThreshold(uint256 _tokenId, uint256 _liquidateThreshold) external onlyOperator(3) {
        require(
            _liquidateThreshold >= 8 * BASIS_POINTS_DIVISOR && _liquidateThreshold <= LIQUIDATE_THRESHOLD_DIVISOR,
            "Out of range"
        );
        liquidateThreshold[_tokenId] = _liquidateThreshold;
        emit SetLiquidateThreshold(_tokenId, _liquidateThreshold);
    }

    function setLiquidationPendingTime(uint256 _liquidationPendingTime) external onlyOperator(3) {
        require(_liquidationPendingTime <= 60, "Above max");
        liquidationPendingTime = _liquidationPendingTime;
        emit SetLiquidationPendingTime(_liquidationPendingTime);
    }

    function setBountyPercent(
        uint32 _bountyPercentFirstCaller,
        uint32 _bountyPercentResolver
    ) external onlyOperator(3) {
        require(_bountyPercentFirstCaller + _bountyPercentResolver <= BASIS_POINTS_DIVISOR, "invalid bountyPercent");
        bountyPercent_.firstCaller = _bountyPercentFirstCaller;
        bountyPercent_.resolver = _bountyPercentResolver;
        emit SetBountyPercent(_bountyPercentFirstCaller, _bountyPercentResolver);
    }

    /* VIEW FUNCTIONS */
    function bountyPercent() external view override returns (uint32, uint32) {
        return (bountyPercent_.firstCaller, bountyPercent_.resolver);
    }

    /* ========== DELEGATE MECHANISM========== */
    /* USER FUNCTIONS */
    function delegate(address[] memory _delegates) external {
        for (uint256 i = 0; i < _delegates.length; ++i) {
            EnumerableSetUpgradeable.add(_delegatesByMaster[msg.sender], _delegates[i]);
        }
    }

    function undelegate(address[] memory _delegates) external {
        for (uint256 i = 0; i < _delegates.length; ++i) {
            EnumerableSetUpgradeable.remove(_delegatesByMaster[msg.sender], _delegates[i]);
        }
    }

    /* OP FUNCTIONS */
    function setGlobalDelegates(address _delegate, bool _allowed) external onlyOperator(2) {
        globalDelegates[_delegate] = _allowed;
        emit GlobalDelegatesChange(_delegate, _allowed);
    }

    /* VIEW FUNCTIONS */
    function getDelegates(address _master) external view override returns (address[] memory) {
        return enumerate(_delegatesByMaster[_master]);
    }

    function checkDelegation(address _master, address _delegate) public view override returns (bool) {
        require(!checkBanList(_master), "account banned");
        return
            _master == _delegate ||
            globalDelegates[_delegate] ||
            EnumerableSetUpgradeable.contains(_delegatesByMaster[_master], _delegate);
    }

    /* ========== BAN MECHANISM========== */
    /* OP FUNCTIONS */
    function addWalletsToBanList(address[] memory _wallets) external onlyOperator(1) {
        for (uint256 i = 0; i < _wallets.length; ++i) {
            EnumerableSetUpgradeable.add(banWalletList, _wallets[i]);
        }
    }

    function removeWalletsFromBanList(address[] memory _wallets) external onlyOperator(1) {
        for (uint256 i = 0; i < _wallets.length; ++i) {
            EnumerableSetUpgradeable.remove(banWalletList, _wallets[i]);
        }
    }

    /* VIEW FUNCTIONS */
    function checkBanList(address _addr) public view override returns (bool) {
        return EnumerableSetUpgradeable.contains(banWalletList, _addr);
    }

    function enumerate(EnumerableSetUpgradeable.AddressSet storage set) internal view returns (address[] memory) {
        uint256 length = EnumerableSetUpgradeable.length(set);
        address[] memory output = new address[](length);
        for (uint256 i; i < length; ++i) {
            output[i] = EnumerableSetUpgradeable.at(set, i);
        }
        return output;
    }
}