// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./BaseToken.sol";
import "./interfaces/IMintable.sol";

contract MintableBaseToken is BaseToken, IMintable {
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) BaseToken(_name, _symbol, _initialSupply) {}

    function burn(address _account, uint256 _amount) external override onlyOwner {
        _burn(_account, _amount);
    }

    function mint(address _account, uint256 _amount) external override onlyOwner {
        _mint(_account, _amount);
    }
}