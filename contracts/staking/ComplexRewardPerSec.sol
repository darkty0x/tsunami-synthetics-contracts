// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IComplexRewarder.sol";
import "./interfaces/IFarmDistributor.sol";
import "../core/interfaces/IOperators.sol";
import "./libraries/BoringERC20.sol";

contract ComplexRewarderPerSec is IComplexRewarder, Initializable, ReentrancyGuardUpgradeable {
    using BoringERC20 for IBoringERC20;

    IBoringERC20 public override rewardToken;
    IFarmDistributor public distributor;
    IOperators public operators;

    struct UserInfo {
        uint256 amount; /// `amount` LP token amount the user has provided.
        uint256 rewardDebt; /// `rewardDebt` The amount of REWARD entitled to the user.
    }

    struct PoolInfo {
        uint256 accTokenPerShare; /// `accTokenPerShare` Amount of REWARD each LP token is worth.
        uint256 startTimestamp; /// `startTimestamp` The start timestamp of rewards.
        uint256 lastRewardTimestamp; /// `lastRewardTimestamp` The last timestamp REWARD was rewarded to the poolInfo.
        uint256 totalRewards; /// `totalRewards` The amount of rewards added to the pool.
    }

    struct RewardInfo {
        uint256 startTimestamp; /// `startTimestamp` The start timestamp of rewards
        uint256 endTimestamp; /// `endTimestamp` The end timestamp of rewards
        uint256 rewardPerSec; /// `rewardPerSec` The amount of rewards per second
    }

    uint256[] public poolIds;
    uint256 public rewardInfoLimit;
    uint256 private ACC_TOKEN_PRECISION; // The precision factor

    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    mapping(uint256 => PoolInfo) public poolInfo;
    mapping(uint256 => RewardInfo[]) public poolRewardInfo;

    event AddPool(uint256 indexed pid);
    event AddRewardInfo(uint256 indexed pid, uint256 indexed phase, uint256 endTimestamp, uint256 rewardPerSec);
    event OnReward(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event UpdatePool(uint256 indexed pid, uint256 lastRewardTimestamp, uint256 lpSupply, uint256 accTokenPerShare);

    modifier onlyDistributor() {
        require(msg.sender == address(distributor), "onlyDistributor: only Distributor can call this function");
        _;
    }

    modifier onlyOperator(uint256 level) {
        require(operators.getOperatorLevel(msg.sender) >= level, "invalid operator");
        _;
    }

    function initialize(
        IBoringERC20 _rewardToken,
        IFarmDistributor _distributor,
        address _operators
    ) public initializer {
        __ReentrancyGuard_init();
        require(
            AddressUpgradeable.isContract(address(_rewardToken)),
            "constructor: reward token must be a valid contract"
        );
        require(
            AddressUpgradeable.isContract(address(_distributor)),
            "constructor: FarmDistributor must be a valid contract"
        );
        require(AddressUpgradeable.isContract(_operators), "operators invalid");
        operators = IOperators(_operators);
        rewardToken = _rewardToken;
        distributor = _distributor;

        uint256 decimalsRewardToken = _rewardToken.safeDecimals();
        require(decimalsRewardToken < 30, "constructor: reward token decimals must be inferior to 30");

        ACC_TOKEN_PRECISION = uint256(10 ** (uint256(30) - (decimalsRewardToken)));
        rewardInfoLimit = 52; //1y /// how many phases are allowed
    }

    /// @notice Add a new pool. Can only be called by the operator.
    /// @param _pid pool id on DistributorV2
    function add(uint256 _pid, uint256 _startTimestamp) public onlyOperator(1) {
        require(poolInfo[_pid].lastRewardTimestamp == 0, "pool already exists");

        poolInfo[_pid] = PoolInfo({
            startTimestamp: _startTimestamp,
            lastRewardTimestamp: _startTimestamp,
            accTokenPerShare: 0,
            totalRewards: 0
        });

        poolIds.push(_pid);
        emit AddPool(_pid);
    }

    /// @notice if the new reward info is added, the reward & its end timestamp will be extended by the newly pushed reward info.
    function addRewardInfo(
        uint256 _pid,
        uint256 _endTimestamp,
        uint256 _rewardPerSec
    ) external payable onlyOperator(3) {
        RewardInfo[] storage rewardInfo = poolRewardInfo[_pid];
        PoolInfo storage pool = poolInfo[_pid];
        require(rewardInfo.length < rewardInfoLimit, "add reward info: reward info length exceeds the limit");
        require(
            rewardInfo.length == 0 || rewardInfo[rewardInfo.length - 1].endTimestamp >= block.timestamp,
            "add reward info: reward period ended"
        );
        require(
            rewardInfo.length == 0 || rewardInfo[rewardInfo.length - 1].endTimestamp < _endTimestamp,
            "add reward info: bad new endTimestamp"
        );

        uint256 startTimestamp = rewardInfo.length == 0
            ? pool.startTimestamp
            : rewardInfo[rewardInfo.length - 1].endTimestamp;

        uint256 timeRange = _endTimestamp - startTimestamp;
        uint256 totalRewards = timeRange * _rewardPerSec;
        rewardToken.safeTransferFrom(msg.sender, address(this), totalRewards);

        pool.totalRewards += totalRewards;

        rewardInfo.push(
            RewardInfo({startTimestamp: startTimestamp, endTimestamp: _endTimestamp, rewardPerSec: _rewardPerSec})
        );

        emit AddRewardInfo(_pid, rewardInfo.length - 1, _endTimestamp, _rewardPerSec);
    }

    /// @notice Withdraw reward. EMERGENCY ONLY.
    function emergencyRewardWithdraw(
        uint256 _pid,
        uint256 _amount,
        address _beneficiary
    ) external nonReentrant onlyOperator(3) {
        PoolInfo storage pool = poolInfo[_pid];
        uint256 lpSupply = distributor.poolTotalLp(_pid);

        uint256 currentStakingPendingReward = _pendingTokens(_pid, lpSupply, 0);

        require(
            currentStakingPendingReward + _amount <= pool.totalRewards,
            "emergency reward withdraw: not enough reward token"
        );
        pool.totalRewards -= _amount;

        rewardToken.safeTransfer(_beneficiary, _amount);
    }

    /// @notice Withdraw reward. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _amount, address _beneficiary) external nonReentrant onlyOperator(3) {
        rewardToken.safeTransfer(_beneficiary, _amount);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() external nonReentrant {
        _massUpdatePools();
    }

    /// @notice Function called by FarmDistributor whenever staker claims VELA harvest. Allows staker to also receive a 2nd reward token.
    /// @param _user Address of user
    /// @param _amount Number of LP tokens the user has
    function onVelaReward(uint256 _pid, address _user, uint256 _amount) external override onlyDistributor {
        PoolInfo memory pool = _updatePool(_pid);
        UserInfo storage user = userInfo[_pid][_user];

        uint256 pending = 0;
        uint256 rewardBalance = 0;

        rewardBalance = rewardToken.balanceOf(address(this));

        if (user.amount > 0) {
            pending = (((user.amount * pool.accTokenPerShare) / ACC_TOKEN_PRECISION) - user.rewardDebt);

            if (pending > 0) {
                if (pending > rewardBalance) {
                    rewardToken.safeTransfer(_user, rewardBalance);
                } else {
                    rewardToken.safeTransfer(_user, pending);
                }
            }
        }

        user.amount = _amount;

        user.rewardDebt = (user.amount * pool.accTokenPerShare) / ACC_TOKEN_PRECISION;

        emit OnReward(_user, pending);
    }

    /// @notice Update reward variables of the given pool.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @return pool Returns the pool that was updated.
    function updatePool(uint256 _pid) external nonReentrant returns (PoolInfo memory pool) {
        return _updatePool(_pid);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function _massUpdatePools() internal {
        uint256 length = poolIds.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            _updatePool(poolIds[pid]);
        }
    }

    /// @notice Update reward variables of the given pool.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @return pool Returns the pool that was updated.
    function _updatePool(uint256 pid) internal returns (PoolInfo memory pool) {
        pool = poolInfo[pid];
        RewardInfo[] memory rewardInfo = poolRewardInfo[pid];
        if (block.timestamp <= pool.lastRewardTimestamp) {
            return pool;
        }

        uint256 lpSupply = distributor.poolTotalLp(pid);

        if (lpSupply == 0) {
            // if there is no total supply, return and use the pool's start timestamp as the last reward timestamp
            // so that ALL reward will be distributed.
            // however, if the first deposit is out of reward period, last reward timestamp will be its timestamp
            // in order to keep the multiplier = 0
            if (block.timestamp > _endTimestampOf(pid, block.timestamp)) {
                pool.lastRewardTimestamp = block.timestamp;
                emit UpdatePool(pid, pool.lastRewardTimestamp, lpSupply, pool.accTokenPerShare);
            }

            return pool;
        }

        /// @dev for each reward info
        for (uint256 i = 0; i < rewardInfo.length; ++i) {
            // @dev get multiplier based on current timestamp and rewardInfo's end timestamp
            // multiplier will be a range of either (current timestamp - pool.timestamp)
            // or (reward info's endtimestamp - pool.timestamp) or 0
            uint256 timeElapsed = getTimeElapsed(pool.lastRewardTimestamp, block.timestamp, rewardInfo[i].endTimestamp);
            if (timeElapsed == 0) continue;

            // @dev if currentTimestamp exceed end timestamp, use end timestamp as the last reward timestamp
            // so that for the next iteration, previous endTimestamp will be used as the last reward timestamp
            if (block.timestamp > rewardInfo[i].endTimestamp) {
                pool.lastRewardTimestamp = rewardInfo[i].endTimestamp;
            } else {
                pool.lastRewardTimestamp = block.timestamp;
            }

            uint256 tokenReward = (timeElapsed * rewardInfo[i].rewardPerSec);

            pool.accTokenPerShare += ((tokenReward * ACC_TOKEN_PRECISION) / lpSupply);
        }

        poolInfo[pid] = pool;

        emit UpdatePool(pid, pool.lastRewardTimestamp, lpSupply, pool.accTokenPerShare);

        return pool;
    }

    /// @notice this will return end timestamp based on the current block timestamp.
    function currentEndTimestamp(uint256 _pid) external view returns (uint256) {
        return _endTimestampOf(_pid, block.timestamp);
    }

    /// @notice View function to see pending Reward on frontend.
    function pendingTokens(uint256 _pid, address _user) external view override returns (uint256) {
        return _pendingTokens(_pid, userInfo[_pid][_user].amount, userInfo[_pid][_user].rewardDebt);
    }

    /// @notice View function to see pool rewards per sec
    function poolRewardsPerSec(uint256 _pid) external view override returns (uint256) {
        return _rewardPerSecOf(_pid, block.timestamp);
    }

    /// @notice Return reward multiplier over the given _from to _to timestamp.
    function getTimeElapsed(uint256 _from, uint256 _to, uint256 _endTimestamp) public pure returns (uint256) {
        if ((_from >= _endTimestamp) || (_from > _to)) {
            return 0;
        }
        if (_to <= _endTimestamp) {
            return _to - _from;
        }
        return _endTimestamp - _from;
    }

    function _endTimestampOf(uint256 _pid, uint256 _timestamp) internal view returns (uint256) {
        RewardInfo[] memory rewardInfo = poolRewardInfo[_pid];
        uint256 len = rewardInfo.length;
        if (len == 0) {
            return 0;
        }
        for (uint256 i = 0; i < len; ++i) {
            if (_timestamp <= rewardInfo[i].endTimestamp) return rewardInfo[i].endTimestamp;
        }

        /// @dev when couldn't find any reward info, it means that _timestamp exceed endTimestamp
        /// so return the latest reward info.
        return rewardInfo[len - 1].endTimestamp;
    }

    function _pendingTokens(
        uint256 _pid,
        uint256 _amount,
        uint256 _rewardDebt
    ) internal view returns (uint256 pending) {
        PoolInfo memory pool = poolInfo[_pid];
        RewardInfo[] memory rewardInfo = poolRewardInfo[_pid];

        uint256 accTokenPerShare = pool.accTokenPerShare;
        uint256 lpSupply = distributor.poolTotalLp(_pid);

        if (block.timestamp > pool.lastRewardTimestamp && lpSupply != 0) {
            uint256 cursor = pool.lastRewardTimestamp;

            for (uint256 i = 0; i < rewardInfo.length; ++i) {
                uint256 timeElapsed = getTimeElapsed(cursor, block.timestamp, rewardInfo[i].endTimestamp);
                if (timeElapsed == 0) continue;
                cursor = rewardInfo[i].endTimestamp;

                uint256 tokenReward = (timeElapsed * rewardInfo[i].rewardPerSec);

                accTokenPerShare += (tokenReward * ACC_TOKEN_PRECISION) / lpSupply;
            }
        }

        pending = (((_amount * accTokenPerShare) / ACC_TOKEN_PRECISION) - _rewardDebt);
    }

    function _rewardPerSecOf(uint256 _pid, uint256 _blockTimestamp) internal view returns (uint256) {
        RewardInfo[] memory rewardInfo = poolRewardInfo[_pid];
        PoolInfo storage pool = poolInfo[_pid];
        uint256 len = rewardInfo.length;
        if (len == 0) {
            return 0;
        }
        if (pool.startTimestamp > _blockTimestamp) {
            return 0;
        }
        for (uint256 i = 0; i < len; ++i) {
            if (_blockTimestamp <= rewardInfo[i].endTimestamp) return rewardInfo[i].rewardPerSec;
        }
        /// @dev when couldn't find any reward info, it means that timestamp exceed endblock
        /// so return 0
        return 0;
    }
}