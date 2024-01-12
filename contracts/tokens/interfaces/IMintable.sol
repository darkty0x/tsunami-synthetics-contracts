// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IMintable {
    function burn(address _account, uint256 _amount) external;

    function mint(address _account, uint256 _amount) external;
}
