// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IPriceFeed {
    function description() external view returns (string memory);

    function getRoundData(address token, uint80 roundId) external view returns (uint80, uint256, uint256, uint256, uint80);

    function latestAnswer(address token) external view returns (uint256);

    function latestRound(address token) external view returns (uint80);

    function setAnswer(address token, uint256 _ts, uint256 _answer) external;
}
