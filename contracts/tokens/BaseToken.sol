// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BaseToken is IERC20, Ownable {
    using SafeERC20 for IERC20;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public override totalSupply;

    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        _mint(msg.sender, _initialSupply);
    }

    function approve(address _spender, uint256 _amount) external override returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    function setInfo(string memory _name, string memory _symbol) external onlyOwner {
        name = _name;
        symbol = _symbol;
    }

    function transfer(address _recipient, uint256 _amount) public virtual override returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) public virtual override returns (bool) {
        require(allowances[_sender][msg.sender] >= _amount, "BaseToken: transfer amount exceeds allowance");
        uint256 nextAllowance = allowances[_sender][msg.sender] - _amount;
        _approve(_sender, msg.sender, nextAllowance);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function allowance(address _owner, address _spender) external view override returns (uint256) {
        return allowances[_owner][_spender];
    }

    function balanceOf(address _account) external view override returns (uint256) {
        return balances[_account];
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_spender != address(0), "BaseToken: approve to the zero address");

        allowances[_owner][_spender] = _amount;

        emit Approval(_owner, _spender, _amount);
    }

    function _burn(address _account, uint256 _amount) internal {
        require(_account != address(0), "BaseToken: burn from the zero address");

        require(balances[_account] >= _amount, "BaseToken: burn amount exceeds balance");
        balances[_account] -= _amount;
        totalSupply -= _amount;

        emit Transfer(_account, address(0), _amount);
    }

    function _mint(address _account, uint256 _amount) internal {
        require(_account != address(0), "BaseToken: mint to the zero address");

        totalSupply += _amount;
        balances[_account] += _amount;

        emit Transfer(address(0), _account, _amount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(_recipient != address(0), "BaseToken: transfer to the zero address");

        require(balances[_sender] >= _amount, "BaseToken: transfer amount exceeds balance");
        balances[_sender] -= _amount;
        balances[_recipient] += _amount;

        emit Transfer(_sender, _recipient, _amount);
    }
}