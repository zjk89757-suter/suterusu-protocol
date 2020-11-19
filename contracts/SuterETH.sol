// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./Utils.sol";
import "./SuterBase.sol";

contract SuterETH is SuterBase {

    constructor(address _transfer, address _burn, uint256 _epochLength, uint256 _unit) SuterBase(_transfer, _burn, _epochLength, _unit) public {
    }

    function fund(Utils.G1Point memory y, uint256 unitAmount) public payable {
        uint256 mUnitAmount = toUnitAmount(msg.value);
        require(unitAmount == mUnitAmount, "Specified fund amount is differnet from the paid amount.");

        fundBase(y, unitAmount);
    }

    function burn(Utils.G1Point memory y, uint256 unitAmount, Utils.G1Point memory u, bytes memory proof) public {
        burnBase(y, unitAmount, u, proof);
        uint256 nativeAmount = toNativeAmount(unitAmount);
        msg.sender.transfer(nativeAmount);
    }
}


