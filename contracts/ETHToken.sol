// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;


abstract contract ZicoToken {

    function testFunc() virtual public view  returns (string memory);
}

contract ETHToken is ZicoToken {
    uint public myBalance;

    constructor() public payable {
        myBalance = msg.value;
    }

    function takeETH() public payable {
        myBalance += msg.value;
    }

    function testFunc() override public view  returns (string memory) {
        return "ETHToken";
    }

}

contract ETHToken2 is ZicoToken {
    function testFunc() override public view  returns (string memory) {
        return "ETHToken2";
    }
}

contract Test {
    ZicoToken token;

    constructor(address _token) public {
        token = ZicoToken(_token);
    }

    function execFunc() public view returns (string memory) {
        return token.testFunc();
    }
}
