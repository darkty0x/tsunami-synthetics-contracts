// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
contract MockPyth{
    mapping(bytes32=>PythStructs.Price) priceData;
    /*
    struct Price {
        // Price
        int64 price;
        // Confidence interval around the price
        uint64 conf;
        // Price exponent
        int32 expo;
        // Unix timestamp describing when the price was published
        uint publishTime;
    }
    */
    function setPrice(bytes32 _priceId, int64 _price, int32 _expo, uint _publishTime) external{
        priceData[_priceId] = PythStructs.Price({
            price: _price,
            conf: 0, // we do not use this
            expo: _expo,
            publishTime: _publishTime
        });
    }

    function getPriceUnsafe(bytes32 _priceId) external view returns (PythStructs.Price memory){
        return priceData[_priceId];
    }

    function getCurrentTime() external view returns (uint256) {
        return block.timestamp;
    }
}