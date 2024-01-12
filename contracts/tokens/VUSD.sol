// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IVUSD.sol";

contract VUSD is IVUSD, Ownable {
    uint8 public constant decimals = 30;

    string public name;
    string public symbol;
    uint256 public totalSupply;
    mapping(address => uint256) public balances;
    event Burn(address indexed account, uint256 value);
    event Mint(address indexed beneficiary, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        _mint(msg.sender, _initialSupply);
    }

    function burn(address _account, uint256 _amount) external override onlyOwner {
        _burn(_account, _amount);
    }

    function mint(address _account, uint256 _amount) external override onlyOwner {
        _mint(_account, _amount);
    }

    function setInfo(string memory _name, string memory _symbol) external onlyOwner {
        name = _name;
        symbol = _symbol;
    }

    function balanceOf(address _account) external view override returns (uint256) {
        return balances[_account];
    }

    function _burn(address _account, uint256 _amount) internal {
        require(_account != address(0), "VUSD: burn from the zero address");

        require(balances[_account] >= _amount, "VUSD: burn amount exceeds balance");
        balances[_account] -= _amount;
        totalSupply -= _amount;
        emit Burn(_account, _amount);
    }

    function _mint(address _account, uint256 _amount) internal {
        require(_account != address(0), "VUSD: mint to the zero address");
        totalSupply += _amount;
        balances[_account] += _amount;
        emit Mint(_account, _amount);
    }
}