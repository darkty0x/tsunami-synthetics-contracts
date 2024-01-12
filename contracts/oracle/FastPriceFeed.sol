// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/IPriceFeed.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

uint256 constant BASIS_POINTS_DIVISOR = 100000;
uint256 constant PRICE_BASE = 10**8;

// Might no longer be used and they just call Pyth directly in the PriceManager
contract FastPriceFeed is IPriceFeed {
    IPyth pyth;
    address public gov;
    mapping(address=>uint256) public ts;
    mapping(address=>uint256) public answer;
    string public override description = "FastPriceFeed";
    uint256 public decimals;
    mapping(address=>uint80) public roundId;

    mapping(address=>mapping(uint80 => uint256)) public answers;
    mapping(address=>mapping(uint80 => uint256)) public latestAts;
    mapping(address => bool) public isAdmin;
    mapping(address => bytes32) public priceIds;
    mapping(address => uint256) public allowedDeviation;
    mapping(address => uint256) public allowedStaleness;

    event SetAdmin(address indexed account, bool isAdmin);
    event SetDecription(string description);
    event SetAnswer(address token, uint256 ts, uint256 answer);

    constructor() {
        gov = msg.sender;
        isAdmin[msg.sender] = true;
    }

    function setPyth(IPyth _pyth) external{
        require(msg.sender == gov, "PriceFeed: forbidden");
        pyth = _pyth;
    }

    function setAdmin(address _account, bool _isAdmin) external {
        require(msg.sender == gov, "PriceFeed: forbidden");
        isAdmin[_account] = _isAdmin;
        emit SetAdmin(_account, _isAdmin);
    }

    function setToken(address _token, bytes32 _priceId, uint256 _allowedDeviation, uint256 _allowedStaleness) external {
        require(msg.sender == gov, "PriceFeed: forbidden");
        require(_allowedDeviation < BASIS_POINTS_DIVISOR, "invalid _allowedDeviation");
        priceIds[_token] = _priceId;
        allowedDeviation[_token] = _allowedDeviation;
        allowedStaleness[_token] = _allowedStaleness;
    }

    function setDescription(string memory _description) external {
        require(isAdmin[msg.sender], "PriceFeed: forbidden");
        description = _description;
        emit SetDecription(_description);
    }

    function getPythLastPrice(address _token, bool _requireFreshness) public view returns (uint256) {
        PythStructs.Price memory priceInfo = pyth.getPriceUnsafe(priceIds[_token]);
        if(_requireFreshness){
            require(block.timestamp <= priceInfo.publishTime + allowedStaleness[_token], "price stale");
        }
        uint256 price = uint256(uint64(priceInfo.price));
        if (priceInfo.expo >= 0) {
            uint256 exponent = uint256(uint32(priceInfo.expo));
            return price * PRICE_BASE * (10 ** exponent);
        } else {
            uint256 exponent = uint256(uint32(-priceInfo.expo));
            return price * PRICE_BASE / (10 ** exponent);
        }
    }

    function setAnswer(address _token, uint256 _ts, uint256 _answer) public override {
        require(isAdmin[msg.sender], "PriceFeed: forbidden");
        if(_ts < ts[_token]) {
            return; //other tx have already updated, simply return
        }
        if(priceIds[_token] != bytes32(0)){
            uint256 priceOnChain = getPythLastPrice(_token, false);
            uint256 diff;
            if(_answer > priceOnChain){
                diff = _answer - priceOnChain;
            }else{
                diff = priceOnChain - _answer;
            }
            uint256 ratio = diff * BASIS_POINTS_DIVISOR / priceOnChain;
            require(ratio <= allowedDeviation[_token], "need update pyth price");
        }
        uint80 r = ++roundId[_token];
        answer[_token] = _answer;
        ts[_token] = _ts;
        answers[_token][r] = _answer;
        latestAts[_token][r] = _ts;
        emit SetAnswer(_token, _ts, _answer);
        
    }

    function setLatestAnswer(address _token, uint256 _answer) external {
        setAnswer(_token, block.timestamp, _answer);
    }

    function latestAnswer(address _token) external view override returns (uint256) {
        if (allowedStaleness[_token] == 0){ 
            // same as before, no check staleness
            return answer[_token];
        }
        uint256 timeDiff = block.timestamp - ts[_token];
        if (timeDiff <= allowedStaleness[_token]) { 
            // our price is fresh enough, return our answer
            return answer[_token];
        } else{
            // our price is stale, try use on-chain price with freshness requirement
            return getPythLastPrice(_token, true);
        }
    }

    function latestRound(address _token) external view override returns (uint80) {
        return roundId[_token];
    }

    // returns roundId, answer, startedAt, updatedAt, answeredInRound
    function getRoundData(address _token, uint80 _roundId) external view override returns (uint80, uint256, uint256, uint256, uint80) {
        return (_roundId, answers[_token][_roundId], latestAts[_token][_roundId], 0, 0);
    }
}
