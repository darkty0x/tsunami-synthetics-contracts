// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IPriceManager.sol";
import "./interfaces/IOperators.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {Constants} from "../access/Constants.sol";

contract PriceManager is Constants, Initializable, IPriceManager {
    IOperators public operators;
    IPyth public pyth;

    mapping(uint256 => Asset) public assets;
    struct Asset {
        string symbol;
        bytes32 pythId;
        uint256 price;
        uint256 timestamp;
        uint256 allowedStaleness;
        uint256 allowedDeviation;
        uint256 maxLeverage;
        uint256 tokenDecimals; // for usd stablecoin only
    }

    mapping(address => uint256) public tokenAddressToAssetId; // for usd stablecoin

    // an array to track valid assets
    uint256[] private validAssetIds;

    event SetAsset(
        uint256 assetId,
        string symbol,
        bytes32 pythId,
        uint256 price,
        uint256 timestamp,
        uint256 allowedStaleness,
        uint256 allowedDeviation,
        uint256 maxLeverage
    );
    event SetUsdAsset(
        address tokenAddress,
        uint256 assetId,
        string symbol,
        bytes32 pythId,
        uint256 price,
        uint256 timestamp,
        uint256 allowedStaleness,
        uint256 allowedDeviation,
        uint256 tokenDecimals
    );
    event SetPrice(uint256 assetId, uint256 price, uint256 timestamp);

    modifier onlyOperator(uint256 level) {
        require(operators.getOperatorLevel(msg.sender) >= level, "invalid operator");
        _;
    }

    function initialize(address _operators, address _pyth) public initializer {
        require(AddressUpgradeable.isContract(_operators), "operators invalid");
        require(AddressUpgradeable.isContract(_pyth), "pyth invalid");

        operators = IOperators(_operators);
        pyth = IPyth(_pyth);
    }

    function setAsset(
        uint256 _assetId,
        string calldata _symbol,
        bytes32 _pythId,
        uint256 _price,
        uint256 _allowedStaleness,
        uint256 _allowedDeviation,
        uint256 _maxLeverage
    ) external onlyOperator(3) {
        require(_maxLeverage > MIN_LEVERAGE, "Max Leverage should be greater than Min Leverage");

        // new asset
        if (assets[_assetId].maxLeverage == 0) {
            validAssetIds.push(_assetId);
        }

        assets[_assetId] = Asset({
            symbol: _symbol,
            pythId: _pythId,
            price: _price,
            timestamp: block.timestamp,
            allowedStaleness: _allowedStaleness,
            allowedDeviation: _allowedDeviation,
            maxLeverage: _maxLeverage,
            tokenDecimals: 0
        });

        emit SetAsset(
            _assetId,
            _symbol,
            _pythId,
            _price,
            block.timestamp,
            _allowedStaleness,
            _allowedDeviation,
            _maxLeverage
        );
    }

    function batchSetAllowedDeviation(uint256[] memory _assetIds, uint256 _allowedDeviation) external onlyOperator(3) {
        for(uint256 i; i<_assetIds.length; i++){
            uint256 _assetId = _assetIds[i];
            Asset memory asset = assets[_assetId];
            require(asset.maxLeverage > 0, "!newAsset");
            asset.allowedDeviation = _allowedDeviation;
            assets[_assetId] = asset;
            emit SetAsset(
                _assetId,
                asset.symbol,
                asset.pythId,
                asset.price,
                asset.timestamp,
                asset.allowedStaleness,
                asset.allowedDeviation,
                asset.maxLeverage
            );
        }
    }

    function batchSetAllowedStaleness(uint256[] memory _assetIds, uint256 _allowedStaleness) external onlyOperator(3) {
        for(uint256 i; i<_assetIds.length; i++){
            uint256 _assetId = _assetIds[i];
            Asset memory asset = assets[_assetId];
            require(asset.maxLeverage > 0, "!newAsset");
            asset.allowedStaleness = _allowedStaleness;
            assets[_assetId] = asset;
            emit SetAsset(
                _assetId,
                asset.symbol,
                asset.pythId,
                asset.price,
                asset.timestamp,
                asset.allowedStaleness,
                asset.allowedDeviation,
                asset.maxLeverage
            );
        }
    }

    function batchSetMaxLeverage(uint256[] memory _assetIds, uint256 _maxLeverage) external onlyOperator(3) {
        for(uint256 i; i<_assetIds.length; i++){
            uint256 _assetId = _assetIds[i];
            Asset memory asset = assets[_assetId];
            require(asset.maxLeverage > 0, "!newAsset");
            asset.maxLeverage = _maxLeverage;
            assets[_assetId] = asset;
            emit SetAsset(
                _assetId,
                asset.symbol,
                asset.pythId,
                asset.price,
                asset.timestamp,
                asset.allowedStaleness,
                asset.allowedDeviation,
                asset.maxLeverage
            );
        }
    }

    function setUsdAsset(
        address _tokenAddress,
        uint256 _assetId,
        string calldata _symbol,
        bytes32 _pythId,
        uint256 _price,
        uint256 _allowedStaleness,
        uint256 _allowedDeviation,
        uint256 _tokenDecimals
    ) external onlyOperator(3) {
        // new asset
        if (assets[_assetId].tokenDecimals == 0) {
            validAssetIds.push(_assetId);
        }

        tokenAddressToAssetId[_tokenAddress] = _assetId;
        assets[_assetId] = Asset({
            symbol: _symbol,
            pythId: _pythId,
            price: _price,
            timestamp: block.timestamp,
            allowedStaleness: _allowedStaleness,
            allowedDeviation: _allowedDeviation,
            maxLeverage: 0,
            tokenDecimals: _tokenDecimals
        });

        emit SetUsdAsset(
            _tokenAddress,
            _assetId,
            _symbol,
            _pythId,
            _price,
            block.timestamp,
            _allowedStaleness,
            _allowedDeviation,
            _tokenDecimals
        );
    }

    function getPythLastPrice(uint256 _assetId, bool _requireFreshness) public view returns (uint256) {
        PythStructs.Price memory priceInfo = pyth.getPriceUnsafe(assets[_assetId].pythId);
        if (_requireFreshness) {
            require(block.timestamp <= priceInfo.publishTime + assets[_assetId].allowedStaleness, "price stale");
        }

        uint256 price = uint256(uint64(priceInfo.price));
        if (priceInfo.expo >= 0) {
            uint256 exponent = uint256(uint32(priceInfo.expo));
            return price * PRICE_PRECISION * (10 ** exponent);
        } else {
            uint256 exponent = uint256(uint32(-priceInfo.expo));
            return (price * PRICE_PRECISION) / (10 ** exponent);
        }
    }

    function getLastPrice(uint256 _assetId) public view override returns (uint256) {
        uint256 price = assets[_assetId].price;
        require(price > 0, "invalid price");

        uint256 ts = assets[_assetId].timestamp;
        uint256 allowedStaleness = assets[_assetId].allowedStaleness;
        if (allowedStaleness == 0 || block.timestamp - ts <= allowedStaleness) {
            // our price is fresh enough, return our answer
            return price;
        } else {
            // our price is stale, try use on-chain price with freshness requirement
            return getPythLastPrice(_assetId, true);
        }
    }

    function setPrice(uint256 _assetId, uint256 _price, uint256 _ts) public onlyOperator(2) {
        require(_ts > assets[_assetId].timestamp, "already updated");
        bytes32 pythId = assets[_assetId].pythId;
        if (pythId != bytes32(0)) {
            //skip validation if pyth not enabled for this asset
            uint256 priceOnChain = getPythLastPrice(_assetId, false);
            uint256 deviation = _price > priceOnChain
                ? ((_price - priceOnChain) * BASIS_POINTS_DIVISOR) / priceOnChain
                : ((priceOnChain - _price) * BASIS_POINTS_DIVISOR) / priceOnChain;
            require(deviation <= assets[_assetId].allowedDeviation, "need update pyth price");
        }
        assets[_assetId].price = _price;
        assets[_assetId].timestamp = _ts;

        emit SetPrice(_assetId, _price, _ts);
    }

    function tokenToUsd(address _token, uint256 _tokenAmount) external view override returns (uint256) {
        uint256 assetId = tokenAddressToAssetId[_token];

        return (_tokenAmount * getLastPrice(assetId)) / (10 ** assets[assetId].tokenDecimals);
    }

    function usdToToken(address _token, uint256 _usdAmount) external view override returns (uint256) {
        uint256 assetId = tokenAddressToAssetId[_token];

        return (_usdAmount * (10 ** assets[assetId].tokenDecimals)) / getLastPrice(assetId);
    }

    function getCurrentTime() external view returns (uint256) {
        return block.timestamp;
    }

    function maxLeverage(uint256 _assetId) external view override returns (uint256) {
        return assets[_assetId].maxLeverage;
    }

    function getValidAssetIds() external view returns (uint256[] memory) {
        return validAssetIds;
    }
}