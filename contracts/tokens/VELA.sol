// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Vela is ERC20, ERC20Permit, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    address private _trustedForwarder;
    // Control support for EIP-2771 Meta Transactions
    bool public metaTxnsEnabled;

    uint256 private _initialSupply; // 0 tokens is the initial supply
    uint256 private _maxSupply = 100000000 * 10 ** decimals(); // 100M tokens is maximum supply

    event MetaTxnsDisabled(address indexed caller);
    event MetaTxnsEnabled(address indexed caller);
    event TokensRescued(address indexed sender, address indexed token, uint256 value);

    constructor(address trustedForwarder) ERC20("Vela", "VELA") ERC20Permit("Vela") {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(PAUSER_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
        _setupRole(RESCUER_ROLE, _msgSender());
        _trustedForwarder = trustedForwarder;
        _mint(_msgSender(), _initialSupply);
    }

    // Disable support for meta transactions
    function disableMetaTxns() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(metaTxnsEnabled, "Meta transactions are already disabled");

        metaTxnsEnabled = false;
        emit MetaTxnsDisabled(_msgSender());
    }

    // Enable support for meta transactions
    function enableMetaTxns() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!metaTxnsEnabled, "Meta transactions are already enabled");

        metaTxnsEnabled = true;
        emit MetaTxnsEnabled(_msgSender());
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= _maxSupply, "ERC20: cannot mint more tokens, cap exceeded");
        _mint(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function rescueTokens(IERC20 token, uint256 value) external onlyRole(RESCUER_ROLE) {
        token.transfer(_msgSender(), value);
        emit TokensRescued(_msgSender(), address(token), value);
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Returns the maximum amount of tokens that can be minted.
     */
    function maxSupply() external view returns (uint256) {
        return _maxSupply;
    }

    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return forwarder == _trustedForwarder;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _msgData() internal view override returns (bytes calldata) {
        if (isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length - 20];
        } else {
            return super._msgData();
        }
    }

    function _msgSender() internal view override returns (address sender) {
        if (isTrustedForwarder(msg.sender)) {
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return super._msgSender();
        }
    }
}
