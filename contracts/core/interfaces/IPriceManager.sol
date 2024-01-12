// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IPriceManager {
    function getLastPrice(uint256 _tokenId) external view returns (uint256);

    function maxLeverage(uint256 _tokenId) external view returns (uint256);

    function tokenToUsd(address _token, uint256 _tokenAmount) external view returns (uint256);

    function usdToToken(address _token, uint256 _usdAmount) external view returns (uint256);
}