// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract CashToken is ERC20 {
    uint INITIAL_SUPPLY = 12000;

    constructor() ERC20("SuterToken", "ST") public {
        _setupDecimals(2);
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
