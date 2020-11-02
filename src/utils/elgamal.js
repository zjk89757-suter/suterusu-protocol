const bn128 = require('./bn128.js'); 


const elgamal = {};

elgamal.MAX_PLAIN = 2**32 - 1;

/**
ct is serialized ElGamal ciphertext, x is a BN.
TODO: This could be slow if we don't provide an initial guess for the balance. Need to optimize.
*/
elgamal.decrypt = (ct, x) => {
    CL = bn128.unserialize(ct[0]);
    CR = bn128.unserialize(ct[1]);
    var gB = CL.add(CR.mul(x.redNeg()));

    var accumulator = bn128.zero;
    for (var i = 0; i < elgamal.MAX_PLAIN; i++) {
        if (accumulator.eq(gB)) {
            return i;
        }
        accumulator = accumulator.add(bn128.curve.g);
    }
    throw "Unable to decrypt the ciphertext: " + ct;
};

elgamal.addPlain = (ct, plain) => {
    var cL = bn128.serialize(bn128.unserialize(ct[0]).add(bn128.curve.g.mul(plain)));
    var cR = ct[1];
    return [cL, cR];
};

elgamal.subPlain = (ct, plain) => {
    return elgamal.addPlain(ct, -plain);
};

module.exports = elgamal
