// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./Utils.sol";
import "./InnerProductVerifier.sol";

contract BurnVerifier {
    using Utils for uint256;
    using Utils for Utils.G1Point;

    InnerProductVerifier ip;

    struct BurnStatement {
        Utils.G1Point CLn;
        Utils.G1Point CRn;
        Utils.G1Point y;
        uint256 epoch; // or uint8?
        address sender;
        Utils.G1Point u;
    }

    struct BurnProof {
        Utils.G1Point BA;
        Utils.G1Point BS;

        Utils.G1Point[2] tCommits;
        uint256 tHat;
        uint256 mu;

        uint256 c;
        uint256 s_sk;
        uint256 s_b;
        uint256 s_tau;

        InnerProductVerifier.InnerProductProof ipProof;
    }

    constructor(address _ip) public {
        ip = InnerProductVerifier(_ip);
    }

    function verifyBurn(Utils.G1Point memory CLn, Utils.G1Point memory CRn, Utils.G1Point memory y, uint256 epoch, Utils.G1Point memory u, address sender, bytes memory proof) public view returns (bool) {
        BurnStatement memory statement; // WARNING: if this is called directly in the console,
        // and your strings are less than 64 characters, they will be padded on the right, not the left. should hopefully not be an issue,
        // as this will typically be called simply by the other contract. still though, beware
        statement.CLn = CLn;
        statement.CRn = CRn;
        statement.y = y;
        statement.epoch = epoch;
        statement.u = u;
        statement.sender = sender;
        BurnProof memory burnProof = unserialize(proof);
        return verify(statement, burnProof);
    }

    struct BurnAuxiliaries {
        uint256 y;
        uint256[32] ys;
        uint256 z;
        uint256[1] zs; // silly. just to match zether.
        uint256 zSum;
        uint256[32] twoTimesZSquared;
        uint256 x;
        uint256 t;
        uint256 k;
        Utils.G1Point tEval;
    }

    struct SigmaAuxiliaries {
        uint256 c;
        Utils.G1Point A_y;
        Utils.G1Point A_b;
        Utils.G1Point A_t;
        Utils.G1Point gEpoch;
        Utils.G1Point A_u;
    }

    struct IPAuxiliaries {
        Utils.G1Point P;
        Utils.G1Point u_x;
        Utils.G1Point[] hPrimes;
        Utils.G1Point hPrimeSum;
        uint256 o;
    }

    function gSum() internal pure returns (Utils.G1Point memory) {
        return Utils.G1Point(0x2257118d30fe5064dda298b2fac15cf96fd51f0e7e3df342d0aed40b8d7bb151, 0x0d4250e7509c99370e6b15ebfe4f1aa5e65a691133357901aa4b0641f96c80a8);
    }

    function verify(BurnStatement memory statement, BurnProof memory proof) internal view returns (bool) {
        uint256 statementHash = uint256(keccak256(abi.encode(statement.CLn, statement.CRn, statement.y, statement.epoch, statement.sender))).gMod(); // stacktoodeep?

        BurnAuxiliaries memory burnAuxiliaries;
        burnAuxiliaries.y = uint256(keccak256(abi.encode(statementHash, proof.BA, proof.BS))).gMod();
        burnAuxiliaries.ys[0] = 1;
        burnAuxiliaries.k = 1;
        for (uint256 i = 1; i < 32; i++) {
            burnAuxiliaries.ys[i] = burnAuxiliaries.ys[i - 1].gMul(burnAuxiliaries.y);
            burnAuxiliaries.k = burnAuxiliaries.k.gAdd(burnAuxiliaries.ys[i]);
        }
        burnAuxiliaries.z = uint256(keccak256(abi.encode(burnAuxiliaries.y))).gMod();
        burnAuxiliaries.zs = [burnAuxiliaries.z.gExp(2)];
        burnAuxiliaries.zSum = burnAuxiliaries.zs[0].gMul(burnAuxiliaries.z); // trivial sum
        burnAuxiliaries.k = burnAuxiliaries.k.gMul(burnAuxiliaries.z.gSub(burnAuxiliaries.zs[0])).gSub(burnAuxiliaries.zSum.gMul(2 ** 32).gSub(burnAuxiliaries.zSum));
        burnAuxiliaries.t = proof.tHat.gSub(burnAuxiliaries.k);
        for (uint256 i = 0; i < 32; i++) {
            burnAuxiliaries.twoTimesZSquared[i] = burnAuxiliaries.zs[0].gMul(2 ** i);
        }

        burnAuxiliaries.x = uint256(keccak256(abi.encode(burnAuxiliaries.z, proof.tCommits))).gMod();
        burnAuxiliaries.tEval = proof.tCommits[0].pMul(burnAuxiliaries.x).pAdd(proof.tCommits[1].pMul(burnAuxiliaries.x.gMul(burnAuxiliaries.x))); // replace with "commit"?

        SigmaAuxiliaries memory sigmaAuxiliaries;
        sigmaAuxiliaries.A_y = Utils.g().pMul(proof.s_sk).pAdd(statement.y.pMul(proof.c.gNeg()));
        sigmaAuxiliaries.A_b = Utils.g().pMul(proof.s_b).pAdd(statement.CRn.pMul(proof.s_sk).pAdd(statement.CLn.pMul(proof.c.gNeg())).pMul(burnAuxiliaries.zs[0]));
        sigmaAuxiliaries.A_t = Utils.g().pMul(burnAuxiliaries.t).pAdd(burnAuxiliaries.tEval.pNeg()).pMul(proof.c).pAdd(Utils.h().pMul(proof.s_tau)).pAdd(Utils.g().pMul(proof.s_b.gNeg()));
        sigmaAuxiliaries.gEpoch = Utils.mapInto("Zether", statement.epoch);
        sigmaAuxiliaries.A_u = sigmaAuxiliaries.gEpoch.pMul(proof.s_sk).pAdd(statement.u.pMul(proof.c.gNeg()));

        sigmaAuxiliaries.c = uint256(keccak256(abi.encode(burnAuxiliaries.x, sigmaAuxiliaries.A_y, sigmaAuxiliaries.A_b, sigmaAuxiliaries.A_t, sigmaAuxiliaries.A_u))).gMod();
        require(sigmaAuxiliaries.c == proof.c, "Sigma protocol challenge equality failure.");

        IPAuxiliaries memory ipAuxiliaries;
        ipAuxiliaries.o = uint256(keccak256(abi.encode(sigmaAuxiliaries.c))).gMod();
        ipAuxiliaries.u_x = Utils.g().pMul(ipAuxiliaries.o);
        ipAuxiliaries.hPrimes = new Utils.G1Point[](32);
        for (uint256 i = 0; i < 32; i++) {
            ipAuxiliaries.hPrimes[i] = ip.hs(i).pMul(burnAuxiliaries.ys[i].gInv());
            ipAuxiliaries.hPrimeSum = ipAuxiliaries.hPrimeSum.pAdd(ipAuxiliaries.hPrimes[i].pMul(burnAuxiliaries.ys[i].gMul(burnAuxiliaries.z).gAdd(burnAuxiliaries.twoTimesZSquared[i])));
        }
        ipAuxiliaries.P = proof.BA.pAdd(proof.BS.pMul(burnAuxiliaries.x)).pAdd(gSum().pMul(burnAuxiliaries.z.gNeg())).pAdd(ipAuxiliaries.hPrimeSum);
        ipAuxiliaries.P = ipAuxiliaries.P.pAdd(Utils.h().pMul(proof.mu.gNeg()));
        ipAuxiliaries.P = ipAuxiliaries.P.pAdd(ipAuxiliaries.u_x.pMul(proof.tHat));
        require(ip.verifyInnerProduct(ipAuxiliaries.hPrimes, ipAuxiliaries.u_x, ipAuxiliaries.P, proof.ipProof, ipAuxiliaries.o), "Inner product proof verification failed.");

        return true;
    }

    function unserialize(bytes memory arr) internal pure returns (BurnProof memory proof) {
        proof.BA = Utils.G1Point(Utils.slice(arr, 0), Utils.slice(arr, 32));
        proof.BS = Utils.G1Point(Utils.slice(arr, 64), Utils.slice(arr, 96));

        proof.tCommits = [Utils.G1Point(Utils.slice(arr, 128), Utils.slice(arr, 160)), Utils.G1Point(Utils.slice(arr, 192), Utils.slice(arr, 224))];
        proof.tHat = uint256(Utils.slice(arr, 256));
        proof.mu = uint256(Utils.slice(arr, 288));

        proof.c = uint256(Utils.slice(arr, 320));
        proof.s_sk = uint256(Utils.slice(arr, 352));
        proof.s_b = uint256(Utils.slice(arr, 384));
        proof.s_tau = uint256(Utils.slice(arr, 416));

        InnerProductVerifier.InnerProductProof memory ipProof;
        ipProof.ls = new Utils.G1Point[](5);
        ipProof.rs = new Utils.G1Point[](5);
        for (uint256 i = 0; i < 5; i++) { // 2^5 = 32.
            ipProof.ls[i] = Utils.G1Point(Utils.slice(arr, 448 + i * 64), Utils.slice(arr, 480 + i * 64));
            ipProof.rs[i] = Utils.G1Point(Utils.slice(arr, 448 + (5 + i) * 64), Utils.slice(arr, 480 + (5 + i) * 64));
        }
        ipProof.a = uint256(Utils.slice(arr, 448 + 5 * 128));
        ipProof.b = uint256(Utils.slice(arr, 480 + 5 * 128));
        proof.ipProof = ipProof;

        return proof;
    }
}
