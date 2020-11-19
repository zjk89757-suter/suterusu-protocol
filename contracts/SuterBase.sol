// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./Utils.sol";
import "./TransferVerifier.sol";
import "./BurnVerifier.sol";

contract SuterBase {

    using Utils for uint256;
    using Utils for Utils.G1Point;

    TransferVerifier transferverifier;
    BurnVerifier burnverifier;
    uint256 public epochLength; // TODO: now in seconds, need to change to # blocks.

    /* 
       The # of tokens that constitute one unit.
       Balances, funds, burns, and transfers are all interpreted in terms of unit, rather than token. 
    */
    uint256 public unit; 

    /*
       Max units that can handle by suter.
       (No sload for constants...!)
    */
    uint256 public constant MAX = 2**32-1;

    uint256 public totalBalance = 0;
    

    mapping(bytes32 => Utils.G1Point[2]) acc; // main account mapping
    mapping(bytes32 => Utils.G1Point[2]) pending; // storage for pending transfers
    mapping(bytes32 => uint256) lastRollOver;
    bytes32[] nonceSet; // would be more natural to use a mapping, but they can't be deleted / reset!
    uint256 lastGlobalUpdate = 0; // will be also used as a proxy for "current epoch", seeing as rollovers will be anticipated
    //// not implementing account locking for now...revisit

    event TransferOccurred(Utils.G1Point[] parties); // all parties will be notified, client can determine whether it was real or not.
    //// arg is still necessary for transfers---not even so much to know when you received a transfer, as to know when you got rolled over.

    constructor(address _transfer, address _burn, uint256 _epochLength, uint256 _unit) public {
        transferverifier = TransferVerifier(_transfer);
        burnverifier = BurnVerifier(_burn);
        epochLength = _epochLength;
        unit = _unit;
    }

    function toUnitAmount(uint256 nativeAmount) internal view returns (uint256) {
        require(msg.value % unit == 0, "Amount must be multiple of 1e16 wei (0.01 ETH).");
        uint256 amount = nativeAmount / unit;
        require(0 <= amount && amount <= MAX, "Amount out of range."); 
        return amount;
    }

    function toNativeAmount(uint256 unitAmount) internal view returns (uint256) {
        require(0 <= unitAmount && unitAmount <= MAX, "Amount out of range");
        return unitAmount * unit;
    }

    function register(Utils.G1Point memory y, uint256 c, uint256 s) public {
        // allows y to participate. c, s should be a Schnorr signature on "this"
        Utils.G1Point memory K = Utils.g().pMul(s).pAdd(y.pMul(c.gNeg()));
        uint256 challenge = uint256(keccak256(abi.encode(address(this), y, K))).gMod();
        require(challenge == c, "Invalid registration signature!");
        bytes32 yHash = keccak256(abi.encode(y));
        require(!registered(yHash), "Account already registered!");
        // pending[yHash] = [y, Utils.g()]; // "not supported" yet, have to do the below

        /*
            The following initial value of pending[yHash] is equivalent to an ElGamal encryption of m = 0, with nonce r = 1:
            (mG + ry, rG) --> (y, G)
            If we don't set pending in this way, then we can't differentiate two cases:
            1. The account is not registered (both acc and pending are 0, because `mapping` has initial value for all keys)
            2. The account has a total balance of 0 (both acc and pending are 0)

            With such a setting, we can guarantee that, once an account is registered, its `acc` and `pending` can never (crytographically negligible) BOTH equal to Point zero.
            NOTE: `pending` can be reset to Point zero after a roll over.
        */
        pending[yHash][0] = y;
        pending[yHash][1] = Utils.g();
    }

    function registered(bytes32 yHash) public view returns (bool) {
        Utils.G1Point memory zero = Utils.G1Point(0, 0);
        Utils.G1Point[2][2] memory scratch = [acc[yHash], pending[yHash]];
        return !(scratch[0][0].pEqual(zero) && scratch[0][1].pEqual(zero) && scratch[1][0].pEqual(zero) && scratch[1][1].pEqual(zero));
    }

    /**
      Get the current balances of accounts. If the given `epoch` is larger than the last roll over epoch, the returned balances
      will include pending transfers. 
    */
    function getBalance(Utils.G1Point[] memory y, uint256 epoch) view public returns (Utils.G1Point[2][] memory accounts) {
        // in this function and others, i have to use public + memory (and hence, a superfluous copy from calldata)
        // only because calldata structs aren't yet supported by solidity. revisit this in the future.
        uint256 size = y.length;
        accounts = new Utils.G1Point[2][](size);
        for (uint256 i = 0; i < size; i++) {
            bytes32 yHash = keccak256(abi.encode(y[i]));
            accounts[i] = acc[yHash];
            if (lastRollOver[yHash] < epoch) {
                Utils.G1Point[2] memory scratch = pending[yHash];
                accounts[i][0] = accounts[i][0].pAdd(scratch[0]);
                accounts[i][1] = accounts[i][1].pAdd(scratch[1]);
            }
        }
    }

    function getAccountState (Utils.G1Point memory y) public view returns (Utils.G1Point[2] memory y_available, Utils.G1Point[2] memory y_pending) {
        bytes32 yHash = keccak256(abi.encode(y));
        y_available = acc[yHash];
        y_pending = pending[yHash];
        return (y_available, y_pending);
    }

    function rollOver(bytes32 yHash) internal {
        uint256 e = block.timestamp / epochLength;
        if (lastRollOver[yHash] < e) {
            Utils.G1Point[2][2] memory scratch = [acc[yHash], pending[yHash]];
            acc[yHash][0] = scratch[0][0].pAdd(scratch[1][0]);
            acc[yHash][1] = scratch[0][1].pAdd(scratch[1][1]);
            // acc[yHash] = scratch[0]; // can't do this---have to do the above instead (and spend 2 sloads / stores)---because "not supported". revisit
            delete pending[yHash]; // pending[yHash] = [Utils.G1Point(0, 0), Utils.G1Point(0, 0)];
            lastRollOver[yHash] = e;
        }
        if (lastGlobalUpdate < e) {
            lastGlobalUpdate = e;
            delete nonceSet;
        }
    }

    function fundBase(Utils.G1Point memory y, uint256 amount) internal {
        require(amount <= MAX && totalBalance + amount <= MAX, "Fund pushes contract past maximum value.");
        totalBalance += amount;

        bytes32 yHash = keccak256(abi.encode(y));
        require(registered(yHash), "Account not yet registered.");
        rollOver(yHash);

        Utils.G1Point memory scratch = pending[yHash][0];
        scratch = scratch.pAdd(Utils.g().pMul(amount));
        pending[yHash][0] = scratch;
    }

    function burnBase(Utils.G1Point memory y, uint256 amount, Utils.G1Point memory u, bytes memory proof) internal {
        require(totalBalance >= amount, "Burn fails the sanity check.");
        totalBalance -= amount;
        

        bytes32 yHash = keccak256(abi.encode(y));
        require(registered(yHash), "Account not yet registered.");
        rollOver(yHash);

        Utils.G1Point[2] memory scratch = pending[yHash];
        pending[yHash][0] = scratch[0].pAdd(Utils.g().pMul(amount.gNeg()));

        scratch = acc[yHash]; // simulate debit of acc---just for use in verification, won't be applied
        scratch[0] = scratch[0].pAdd(Utils.g().pMul(amount.gNeg()));
        bytes32 uHash = keccak256(abi.encode(u));
        for (uint256 i = 0; i < nonceSet.length; i++) {
            require(nonceSet[i] != uHash, "Nonce already seen!");
        }
        nonceSet.push(uHash);

        require(burnverifier.verifyBurn(scratch[0], scratch[1], y, lastGlobalUpdate, u, msg.sender, proof), "Burn proof verification failed!");
    }

    function transfer(Utils.G1Point[] memory C, Utils.G1Point memory D, Utils.G1Point[] memory y, Utils.G1Point memory u, bytes memory proof) public {
        // TODO: check that sender and receiver should NOT be equal.
        uint256 size = y.length;
        Utils.G1Point[] memory CLn = new Utils.G1Point[](size);
        Utils.G1Point[] memory CRn = new Utils.G1Point[](size);
        require(C.length == size, "Input array length mismatch!");

        for (uint256 i = 0; i < size; i++) {
            bytes32 yHash = keccak256(abi.encode(y[i]));
            require(registered(yHash), "Account not yet registered.");
            rollOver(yHash);
            Utils.G1Point[2] memory scratch = pending[yHash];
            pending[yHash][0] = scratch[0].pAdd(C[i]);
            pending[yHash][1] = scratch[1].pAdd(D);
            // pending[yHash] = scratch; // can't do this, so have to use 2 sstores _anyway_ (as in above)

            scratch = acc[yHash];
            CLn[i] = scratch[0].pAdd(C[i]);
            CRn[i] = scratch[1].pAdd(D);
        }

        bytes32 uHash = keccak256(abi.encode(u));
        for (uint256 i = 0; i < nonceSet.length; i++) {
            require(nonceSet[i] != uHash, "Nonce already seen!");
        }
        nonceSet.push(uHash);

        require(transferverifier.verifyTransfer(CLn, CRn, C, D, y, lastGlobalUpdate, u, proof), "Transfer proof verification failed!");

        emit TransferOccurred(y);
    }
}


