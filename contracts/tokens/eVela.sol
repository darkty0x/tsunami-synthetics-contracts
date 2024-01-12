// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../tokens/MintableBaseToken.sol";

contract eVELA is MintableBaseToken {
    constructor() MintableBaseToken("Escrowed VELA", "esVELA", 0) {}

    function id() external pure returns (string memory _name) {
        return "esVELA";
    }
}
