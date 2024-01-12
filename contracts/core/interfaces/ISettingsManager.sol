// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface ISettingsManager {
    function decreaseOpenInterest(uint256 _tokenId, address _sender, bool _isLong, uint256 _amount) external;

    function increaseOpenInterest(uint256 _tokenId, address _sender, bool _isLong, uint256 _amount) external;

    function openInterestPerAssetPerSide(uint256 _tokenId, bool _isLong) external view returns (uint256);

    function openInterestPerUser(address _sender) external view returns (uint256);

    function bountyPercent() external view returns (uint32, uint32);

    function checkBanList(address _delegate) external view returns (bool);

    function checkDelegation(address _master, address _delegate) external view returns (bool);

    function minCollateral() external view returns (uint256);

    function closeDeltaTime() external view returns (uint256);

    function expiryDuration() external view returns (uint256);

    function selfExecuteCooldown() external view returns (uint256);

    function cooldownDuration() external view returns (uint256);

    function liquidationPendingTime() external view returns (uint256);

    function depositFee(address token) external view returns (uint256);

    function withdrawFee(address token) external view returns (uint256);

    function feeManager() external view returns (address);

    function feeRewardBasisPoints() external view returns (uint256);

    function defaultBorrowFeeFactor() external view returns (uint256);

    function borrowFeeFactor(uint256 tokenId) external view returns (uint256);

    function totalOpenInterest() external view returns (uint256);

    function basisFundingRateFactor() external view returns (uint256);

    function deductFeePercent(address _account) external view returns (uint256);

    function referrerTiers(address _referrer) external view returns (uint256);

    function tierFees(uint256 _tier) external view returns (uint256);

    function fundingIndex(uint256 _tokenId) external view returns (int256);

    function fundingRateFactor(uint256 _tokenId) external view returns (uint256);

    function slippageFactor(uint256 _tokenId) external view returns (uint256);

    function getFundingFee(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        int256 _fundingIndex
    ) external view returns (int256);

    function getBorrowRate(uint256 _tokenId, bool _isLong) external view returns (uint256);

    function getFundingRate(uint256 _tokenId) external view returns (int256);

    function getTradingFee(
        address _account,
        uint256 _tokenId,
        bool _isLong,
        uint256 _sizeDelta
    ) external view returns (uint256);

    function getPnl(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        uint256 _averagePrice,
        uint256 _lastPrice,
        uint256 _lastIncreasedTime,
        uint256 _accruedBorrowFee,
        int256 _fundingIndex
    ) external view returns (int256, int256, int256);

    function updateFunding(uint256 _tokenId) external;

    function getBorrowFee(
        uint256 _borrowedSize,
        uint256 _lastIncreasedTime,
        uint256 _tokenId,
        bool _isLong
    ) external view returns (uint256);

    function getUndiscountedTradingFee(
        uint256 _tokenId,
        bool _isLong,
        uint256 _sizeDelta
    ) external view returns (uint256);

    function getReferFee(address _refer) external view returns (uint256);

    function getReferFeeAndTraderRebate(address _refer) external view returns (uint256 referFee, uint256 traderRebate);

    function platformFees(address _platform) external view returns (uint256);

    function getPriceWithSlippage(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        uint256 _price
    ) external view returns (uint256);

    function getSlippage(uint256 _slippageFactor, uint256 _size) external view returns (uint256);

    function getDelegates(address _master) external view returns (address[] memory);

    function isDeposit(address _token) external view returns (bool);

    function isStakingEnabled(address _token) external view returns (bool);

    function isUnstakingEnabled(address _token) external view returns (bool);

    function isIncreasingPositionDisabled(uint256 _tokenId) external view returns (bool);

    function isDecreasingPositionDisabled(uint256 _tokenId) external view returns (bool);

    function isWhitelistedFromCooldown(address _addr) external view returns (bool);

    function isWhitelistedFromTransferCooldown(address _addr) external view returns (bool);

    function isWithdraw(address _token) external view returns (bool);

    function lastFundingTimes(uint256 _tokenId) external view returns (uint256);

    function liquidateThreshold(uint256) external view returns (uint256);

    function tradingFee(uint256 _tokenId, bool _isLong) external view returns (uint256);

    function defaultMaxOpenInterestPerUser() external view returns (uint256);

    function maxProfitPercent(uint256 _tokenId) external view returns (uint256);

    function defaultMaxProfitPercent() external view returns (uint256);

    function maxOpenInterestPerAssetPerSide(uint256 _tokenId, bool _isLong) external view returns (uint256);

    function priceMovementPercent() external view returns (uint256);

    function maxOpenInterestPerUser(address _account) external view returns (uint256);

    function stakingFee(address token) external view returns (uint256);

    function unstakingFee(address token) external view returns (uint256);

    function triggerGasFee() external view returns (uint256);

    function marketOrderGasFee() external view returns (uint256);

    function maxTriggerPerPosition() external view returns (uint256);

    function maxFundingRate() external view returns (uint256);

    function maxTotalVlp() external view returns (uint256);

    function minProfitDurations(uint256 tokenId) external view returns (uint256);

    function maxCloseProfits(uint256 tokenId) external view returns (uint256);

    function maxCloseProfitPercents(uint256 tokenId) external view returns (uint256);

    function setMaxOpenInterestPerAsset(uint256 _tokenId, uint256 _maxAmount) external;

    function lastFundingRates(uint256 tokenId) external view returns (int256);

    function tempMaxFundingRateFactors(uint256 tokenId) external view returns (uint256);

    function volatilityFactors(uint256 tokenId) external view returns (uint256);

    function longBiasFactors(uint256 tokenId) external view returns (uint256);

    function fundingRateVelocityFactors(uint256 tokenId) external view returns (uint256);
}
