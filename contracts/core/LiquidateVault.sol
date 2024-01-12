// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IPositionVault.sol";
import "./interfaces/ILiquidateVault.sol";
import "./interfaces/IPriceManager.sol";
import "./interfaces/ISettingsManager.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IOperators.sol";

import {Constants} from "../access/Constants.sol";

contract LiquidateVault is Constants, Initializable, ReentrancyGuardUpgradeable, ILiquidateVault {
    // constants
    ISettingsManager private settingsManager;
    IPriceManager private priceManager;
    IPositionVault private positionVault;
    IOperators private operators;
    IVault private vault;
    bool private isInitialized;

    // variables
    mapping(uint256 => address) public liquidateRegistrant;
    mapping(uint256 => uint256) public liquidateRegisterTime;

    event RegisterLiquidation(uint256 posId, address caller);
    event LiquidatePosition(
        uint256 indexed posId,
        address indexed account,
        uint256 indexed tokenId,
        bool isLong,
        int256[3] pnlData,
        uint256[5] posData
    );

    /* ========== INITIALIZE FUNCTIONS ========== */

    function initialize() public initializer {
        __ReentrancyGuard_init();
    }

    function init(
        IPositionVault _positionVault,
        ISettingsManager _settingsManager,
        IVault _vault,
        IPriceManager _priceManager,
        IOperators _operators
    ) external {
        require(!isInitialized, "initialized");
        require(AddressUpgradeable.isContract(address(_positionVault)), "positionVault invalid");
        require(AddressUpgradeable.isContract(address(_settingsManager)), "settingsManager invalid");
        require(AddressUpgradeable.isContract(address(_vault)), "vault invalid");
        require(AddressUpgradeable.isContract(address(_priceManager)), "priceManager is invalid");
        require(AddressUpgradeable.isContract(address(_operators)), "operators is invalid");
        positionVault = _positionVault;
        settingsManager = _settingsManager;
        vault = _vault;
        priceManager = _priceManager;
        operators = _operators;
        isInitialized = true;
    }

    /* ========== CORE FUNCTIONS ========== */

    function registerLiquidatePosition(uint256 _posId) external nonReentrant {
        (bool isPositionLiquidatable, , , ) = validateLiquidationWithPosid(_posId);
        require(isPositionLiquidatable, "position is not liquidatable");
        require(liquidateRegistrant[_posId] == address(0), "not the firstCaller");

        liquidateRegistrant[_posId] = msg.sender;
        liquidateRegisterTime[_posId] = block.timestamp;

        emit RegisterLiquidation(_posId, msg.sender);
    }

    function liquidatePosition(uint256 _posId) external nonReentrant {
        (bool isPositionLiquidatable, int256 pnl, int256 fundingFee, int256 borrowFee) = validateLiquidationWithPosid(
            _posId
        );
        require(isPositionLiquidatable, "position is not liquidatable");
        require(
            operators.getOperatorLevel(msg.sender) >= 1 ||
                (msg.sender == liquidateRegistrant[_posId] &&
                    liquidateRegisterTime[_posId] + settingsManager.liquidationPendingTime() <= block.timestamp),
            "not manager or not allowed before pendingTime"
        );

        Position memory position = positionVault.getPosition(_posId);

        (uint32 firstCallerPercent, uint32 resolverPercent) = settingsManager.bountyPercent();
        uint256 firstCallerBounty = (position.collateral * uint256(firstCallerPercent)) / BASIS_POINTS_DIVISOR;
        uint256 resolverBounty = (position.collateral * uint256(resolverPercent)) / BASIS_POINTS_DIVISOR;
        uint256 vlpBounty = position.collateral - firstCallerBounty - resolverBounty;

        if (liquidateRegistrant[_posId] == address(0)) {
            vault.takeVUSDOut(msg.sender, firstCallerBounty);
        } else {
            vault.takeVUSDOut(liquidateRegistrant[_posId], firstCallerBounty);
        }
        vault.takeVUSDOut(msg.sender, resolverBounty);
        vault.accountDeltaIntoTotalUSD(true, vlpBounty);

        settingsManager.updateFunding(position.tokenId);
        settingsManager.decreaseOpenInterest(position.tokenId, position.owner, position.isLong, position.size);

        emit LiquidatePosition(
            _posId,
            position.owner,
            position.tokenId,
            position.isLong,
            [pnl, fundingFee, borrowFee],
            [position.collateral, position.size, position.averagePrice, priceManager.getLastPrice(position.tokenId), 0]
        );
        positionVault.removeUserAlivePosition(position.owner, _posId);
    }

    /* ========== HELPER FUNCTIONS ========== */

    function validateLiquidationWithPosid(uint256 _posId) public view returns (bool, int256, int256, int256) {
        Position memory position = positionVault.getPosition(_posId);

        return
            validateLiquidation(
                position.tokenId,
                position.isLong,
                position.size,
                position.averagePrice,
                priceManager.getLastPrice(position.tokenId),
                position.lastIncreasedTime,
                position.accruedBorrowFee,
                position.fundingIndex,
                position.collateral
            );
    }

    function validateLiquidationWithPosidAndPrice(
        uint256 _posId,
        uint256 _price
    ) external view returns (bool, int256, int256, int256) {
        Position memory position = positionVault.getPosition(_posId);

        return
            validateLiquidation(
                position.tokenId,
                position.isLong,
                position.size,
                position.averagePrice,
                _price,
                position.lastIncreasedTime,
                position.accruedBorrowFee,
                position.fundingIndex,
                position.collateral
            );
    }

    function validateLiquidation(
        uint256 _tokenId,
        bool _isLong,
        uint256 _size,
        uint256 _averagePrice,
        uint256 _lastPrice,
        uint256 _lastIncreasedTime,
        uint256 _accruedBorrowFee,
        int256 _fundingIndex,
        uint256 _collateral
    ) public view returns (bool isPositionLiquidatable, int256 pnl, int256 fundingFee, int256 borrowFee) {
        require(_size > 0, "invalid position");

        (pnl, fundingFee, borrowFee) = settingsManager.getPnl(
            _tokenId,
            _isLong,
            _size,
            _averagePrice,
            _lastPrice,
            _lastIncreasedTime,
            _accruedBorrowFee,
            _fundingIndex
        );

        // position is liquidatable if pnl is negative and collateral larger than liquidateThreshold are lost
        if (
            pnl < 0 &&
            uint256(-1 * pnl) >=
            (_collateral * settingsManager.liquidateThreshold(_tokenId)) / LIQUIDATE_THRESHOLD_DIVISOR
        ) {
            isPositionLiquidatable = true;
        }
    }
}