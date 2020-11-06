const BN = require('bn.js');
const utils = require('./utils/utils.js');
const bn128 = require('./utils/bn128.js');
const elgamal = require('./utils/elgamal.js');

var sleep = (wait) => new Promise((resolve) => {
    setTimeout(resolve, wait);
});


class Client {
    /**
    Constrct a client, with given web3 object, Suter contract, and home account (Ethereum address). 

    @param web3 A web3 object.
    @param suter The Suter contract address.
    @param home The home account (Ethereum address).
    */
    constructor(web3, suter, home) {
        if (web3 === undefined)
            throw "1st arg should be an initialized Web3 object.";
        if (suter === undefined)
            throw "2nd arg should be a deployed Suter constrct object.";
        if (home === undefined)
            throw "3rd arg should be the address of an Ethereum account.";

        this.web3 = web3;
        this.suter = suter;
        this.home = home;

        // 'this' is special in Javascript compared to other languages, it does NOT refer to the Client object when inside some context. 
        // So better use an alias to fix our reference to the Client object.
        // Reference: https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        var that = this;

        this.gasLimit = 5470000;

        // TODO: set transaction confirmation blocks for testing?
        // Reference: https://github.com/ethereum/web3.js/issues/2666
        // This option is only available in web3 1.3.0, but not in 1.2.1
        // web3.transactionConfirmationBlocks = 1;

        (async function() {
            that.epochLength = await that.suter.methods.epochLength().call();
            that.unit = await that.suter.methods.unit().call();
        })();

        /**
        Get the epoch corresponding to the given timestamp (if not given, use current time).
        This epoch is based on time, and does not start from 0, because it simply divides the timestamp by epoch length.

        TODO: should change to block based.

        @param timestamp The given timestamp. Use current time if it is not given.

        @return The epoch corresponding to the timestamp (current time if not given).
        */
        this._getEpoch = (timestamp) => {
            return Math.floor((timestamp === undefined ? (new Date).getTime() / 1000 : timestamp) / that.epochLength);
        };

        /**
        Get ms away from next epoch change.

        TODO: should change to block based.
        */
        this._away = () => {
            var current = (new Date).getTime();
            return Math.ceil(current / (that.epochLength * 1000)) * (that.epochLength * 1000) - current;
        };
 

        /**
        Suter account, containing various information such as the public/private key pair, balance, etc.
        */
        this.account = new function() {
            this.keypair = undefined;
            this._state = {
                available: 0,
                pending: 0,
                nonceUsed: 0,
                lastRollOver: 0
            };

            this.update = (timestamp) => {
                var updated = {};
                updated.available = this._state.available;
                updated.pending = this._state.pending;
                updated.nonceUsed = this._state.nonceUsed;
                updated.lastRollOver = that._getEpoch(timestamp);
                if (this._state.lastRollOver < updated.lastRollOver) {
                    updated.available += updated.pending;
                    updated.pending = 0;
                    updated.nonceUsed = false;
                }
                return updated;
            };

            this.balance = () => {
                return this._state.available + this._state.pending;
            };

            this.public = () => {
                return this.keypair['y'];
            };

            this.secret = () => {
                return bn128.bytes(this.keypair['x']);
            };
        };

        this.checkRegistered = () => {
            if (that.account.keypair === undefined)
                throw "Call register() first to register an account.";
        };

        this.checkValue = (value) => {
            if (value <= 0 || value > elgamal.MAX_PLAIN)
                throw "Invalid value: " + value;
        };

        this.readBalanceFromContract = () => {
            that.checkRegistered();
            return new Promise((resolve, reject) => {
                that.suter.methods.getBalance([that.account.keypair['y']], that._getEpoch() + 1)
                    .call()
                    .then((result) => {
                        var encBalance = result[0];
                        var balance = elgamal.decrypt(encBalance, that.account.keypair['x']);
                        console.log("Read balance successfully:" + balance);
                        resolve(balance);
                    });
            });
        };

        /**
        [With transaction]
        Register a public/private key pair, stored in this client's Suter account.
        This key pair is used for private interaction with the Suter contract.
        NOTE: this key pair is NOT an Ethereum address, but instead, it should normally
        be used together with an Ethereum account address for the connection between
        Suter and plain Ethereum token.

        @param secret The private key. If not given, then a new public/private key pair is
            generated, otherwise construct the public/private key pair form the private key.

        @return A promise that is resolved (or rejected) with the execution status of the
            registraction transaction.
        */
        this.register = (secret) => {
            return new Promise((resolve, reject) => {
                if (secret === undefined) {
                    var keypair = utils.createAccount();
                    var [c, s] = utils.sign(that.suter._address, keypair);
                    that.suter.methods.register(keypair['y'], c, s)
                        .send({from: that.home, gas: that.gasLimit})
                        .on('transactionHash', (hash) => {
                            console.log("Registration submitted (txHash = \"" + hash + "\").");
                        })
                        .on('receipt', (receipt) => {
                            that.account.keypair = keypair;
                            console.log("Registration successful.");
                            resolve(receipt);
                        })
                        .on('error', (error) => {
                            console.log("Registration failed: " + error);
                            reject(error);
                        });
                } else {
                    // This branch would recover the account previously bound to the secret, and the corresponding balance.
                    that.account.keypair = utils.keyPairFromSecret(secret); 
                    that.readBalanceFromContract()
                        .then((result) => {
                            that.account._state.available = result;
                            console.log("Account recovered successfully, with balance:" + that.account._state.available);
                            resolve();
                        });
                }
            });
        };

        /**
        [With transaction]
        Deposit a given amount of tokens in the Suter account.
        This essentially converts plain tokens to Suter tokens that are encrypted in the Suter contract.
        In other words, X tokens are deducted from this client's home account (Ethereum address), and X Suter
        tokens are added to this client's Suter account.

        The amount is represented in terms of a pre-defined unit. For example, if one unit represents 0.01 ETH,
        then an amount of 100 represents 1 ETH.

        @param value The amount to be deposited into the Suter account, in terms of unit.

        @return A promise that is resolved (or rejected) with the execution status of the deposit transaction.
        */
        this.deposit = (value) => {
            that.checkRegistered();
            that.checkValue();
            var account = that.account;
            console.log("Initiating deposit.");
            return new Promise((resolve, reject) => {
                that.suter.methods.fund(account.keypair['y'])
                    .send({from: that.home, value: value * that.unit, gas: that.gasLimit})
                    .on('transactionHash', (hash) => {
                        console.log("Deposit submitted (txHash = \"" + hash + "\").");
                    })
                    .on('receipt', (receipt) => {
                        account._state = account.update();
                        account._state.pending += value;
                        console.log("Deposit of " + value + " was successful. Balance now " + (account._state.available + account._state.pending) + ".");
                        resolve(receipt);
                    })
                    .on('error', (error) => {
                        console.log("Deposit failed: " + error);
                        reject(error);
                    });
            });
        };

        /**
        [With transaction]
        Withdraw a given amount of tokens from the Suter account, if there is sufficient balance.
        This essentially converts Suter tokens to plain tokens, with X Suter tokens deducted from
        this client's Suter account and X plain tokens added to this client's home account.

        The amount is represented in terms of a pre-defined unit. For example, if one unit represents 0.01 ETH,
        then an amount of 100 represents 1 ETH.

        @param value The amount to be deposited into the Suter account, in terms of unit.

        @return A promise that is resolved (or rejected) with the execution status of the deposit transaction.
        */
        this.withdraw = (value) => {
            that.checkRegistered();
            that.checkValue();
            var account = that.account;
            var state = account.update();
            if (value > state.available + state.pending)
                throw "Requested withdrawal amount of " + value + " exceeds account balance of " + (state.available + state.pending) + ".";
            var wait = that._away();
            var seconds = Math.ceil(wait / 1000);
            var plural  = seconds == 1 ? "" : "s";

            // Wait for the pending incoming cash to be merged into the main available balance.
            if (value > state.available) {
                console.log("Your withdrawal has been queued. Please wait " + seconds + " second" + plural + " for the release of your funds... ");
                return sleep(wait).then(() => that.withdraw(value));
            }
            if (state.nonceUsed) {
                console.log("Your withdrawal has been queued. Please wait " + seconds + " second" + plural + ", until the next epoch...");
                return sleep(wait).then(() => that.withdraw(value));
            }

            return new Promise((resolve, reject) => {
                that.suter.methods.getBalance([account.keypair['y']], that._getEpoch())
                    .call()
                    .then((result) => {
                        var encBalance = result[0];
                        var encNewBalance = elgamal.subPlain(encBalance, value); 
                        // TODO: Proof
                        var proof = "0x1234";
                        var u = bn128.serialize(utils.u(state.lastRollOver, account.keypair['x']));
                        that.suter.methods.burn(account.keypair['y'], value, u, proof)
                            .send({from: that.home, gas: that.gasLimit})
                            .on('transactionHash', (hash) => {
                                console.log("Withdrawal submitted (txHash = \"" + hash + "\").");
                            })
                            .on('receipt', (receipt) => {
                                account._state = account.update();
                                account._state.nonceUsed = true;
                                account._state.pending -= value;
                                console.log("Withdrawal of " + value + " was successful. Balance now " + (account._state.available + account._state.pending) + ".");
                                resolve(receipt);
                            })
                            .on('error', (error) => {
                                console.log("Withdrawal failed: " + error);
                                reject(error);
                            });
                    });
            });
            

        };

    }

}

module.exports = Client;
