const BN = require('bn.js');
const utils = require('./utils/utils.js');
const bn128 = require('./utils/bn128.js');
const elgamal = require('./utils/elgamal.js');
const Service = require('./utils/service.js'); 

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

        var service = new Service();

        this.gasLimit = 5470000;

        // TODO: set transaction confirmation blocks for testing?
        // Reference: https://github.com/ethereum/web3.js/issues/2666
        // This option is only available in web3 1.3.0, but not in 1.2.1
        // web3.transactionConfirmationBlocks = 1;

        (async function() {
            that.epochLength = await that.suter.methods.epochLength().call();

            // The amount of tokens represented by one unit.
            // Most of the time, one token is too small and it is not worthwhile to use private 
            // transaction for such small amount. Hence in Suter, we contrain all private operations 
            // to take place in terms of unit that can represent a large amount of tokens. For example,
            // a reasonable choice of 1 unit could be 1e16 wei (0.01 ETH).
            that.unit = await that.suter.methods.unit().call();
        })();


        this._transfers = new Set();

        /**
        Register the TransferOccurred event for this client.
        Since a transfer is triggered by a sender, it is necessary to register this event to notify a transfer "receiver" to keep track of local account state (without manually synchronizing with contract).
        */
        this.suter.events.TransferOccurred({}) 
            .on('data', (event) => {
                console.log("Receive TransferOccurred event");
                if (that._transfers.has(event.transactionHash)) {
                    // This is the sender of the transfer operation, hence we will simply return.
                    that._transfers.delete(event.transactionHash);
                    return;
                }
                var account = that.account;
                event.returnValues['parties'].forEach((party, i) => {
                    if (bn128.pointEqual(account.publicKey(), party)) {
                        var blockNumber = event.blockNumber;
                        web3.eth.getBlock(blockNumber).then((block) => {
                            account._state = account.update(block.timestamp);
                            web3.eth.getTransaction(event.transactionHash).then((transaction) => {
                                var inputs;
                                that.suter._jsonInterface.forEach((element) => {
                                    if (element['name'] == "transfer")
                                        inputs = element['inputs'];
                                });
                                // slice(10) because the first 10 bytes are used for the Method ID (function selector): 0x********
                                // NOTE: in binary mode, this is just 4 bytes, but since the transaction stores the input as readable
                                // ascii string, hence '0x' and 8 base-16 chars (representing 4 bytse) will constitute 10 bytes.
                                // ABI encoding: https://solidity.readthedocs.io/en/latest/abi-spec.html#argument-encoding
                                var parameters = web3.eth.abi.decodeParameters(inputs, "0x" + transaction.input.slice(10));
                                var ct = elgamal.unserialize([parameters['C'][i], parameters['D']]);
                                var value = elgamal.decrypt(ct, account.privateKey());
                                if (value > 0) {
                                    account._state.pending += value;
                                    console.log("Transfer of " + value + " received! Balance now " + account.balance() + ".");
                                }
                            });
                        });
                    }
                });
            })
            .on('error', (error) => {
                console.log(error); 
            });

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
            // First update to initialize the state.
            this.update();

            this.available = () => {
                return this._state.available;
            };

            this.setAvailable = (value) => {
                this._state.available = value;
            };

            this.pending = () => {
                return this._state.pending;
            };

            this.setPending = (value) => {
                this._state.pending = value;
            };

            this.balance = () => {
                return this._state.available + this._state.pending;
            };

            this.publicKey = () => {
                return this.keypair['y'];
            };

            this.privateKey = () => {
                return this.keypair['x'];
            };

            this.publicKeySerialized = () => {
                return bn128.serialize(this.keypair['y']);
            };

            this.privateKeySerialized = () => {
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

        /**
        Read account balance from Suter contract.
        
        @return A promise that is resolved with the balance.
        */
        this.readBalanceFromContract = () => {
            that.checkRegistered();
            return new Promise((resolve, reject) => {
                that.suter.methods.getBalance([that.account.publicKeySerialized()], that._getEpoch() + 1)
                    .call()
                    .then((result) => {
                        var encBalance = elgamal.unserialize(result[0]);
                        var balance = elgamal.decrypt(encBalance, that.account.privateKey());
                        console.log("Read balance successfully: " + balance);
                        resolve(balance);
                    });
            });
        };

        /**
        Synchronize the local account state with that in the Suter contract.
        Use this when we lose track of the local account state.
        
        @return A promise.
        */
        this.syncAccountState = () => {
            that.checkRegistered();
            return new Promise((resolve, reject) => {
                that.suter.methods.getAccountState(that.account.publicKeySerialized())
                    .call()
                    .then((result) => {
                        var encAvailable = elgamal.unserialize(result['y_available']);
                        var encPending = elgamal.unserialize(result['y_pending']);
                        that.account.setAvailable(
                            elgamal.decrypt(encAvailable, that.account.privateKey())
                        );
                        that.account.setPending(
                            elgamal.decrypt(encPending, that.account.privateKey())
                        );
                        that.account._state.lastRollOver = that._getEpoch();
                        that.account._state.nonceUsed = false;

                        console.log("Account synchronized with contract: available = " + that.account.available() + ", pending = " + that.account.pending());
                        resolve();
                    });
            });
        };


        /**
        [Transaction]
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
                    that.suter.methods.register(bn128.serialize(keypair['y']), c, s)
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
                    that.syncAccountState();
                    resolve();
                }
            });
        };

        /**
        [Transaction]
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
            console.log("Initiating deposit: value of " + value + " units (" + value * that.unit + " wei)");
            return new Promise((resolve, reject) => {
                that.suter.methods.fund(account.publicKeySerialized())
                    .send({from: that.home, value: value * that.unit, gas: that.gasLimit})
                    .on('transactionHash', (hash) => {
                        console.log("Deposit submitted (txHash = \"" + hash + "\").");
                    })
                    .on('receipt', (receipt) => {
                        account._state = account.update();
                        account._state.pending += value;
                        console.log("Deposit of " + value + " was successful. Balance now " + account.balance() + ".");
                        console.log("--- Deposit uses gas: " + receipt["gasUsed"]);
                        resolve(receipt);
                    })
                    .on('error', (error) => {
                        console.log("Deposit failed: " + error);
                        reject(error);
                    });
            });
        };

        /**
        [Transaction]
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
            if (value > account.balance())
                throw "Requested withdrawal amount of " + value + " exceeds account balance of " + account.balance() + ".";
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

            // Heuristic condition to reduce the possibility of failed transaction.
            // 3100 is the estimated time of mining a block. If the remaining time
            // of the current epoch is less than the time of minig a block, then
            // we should just wait until the next epoch for the burn, otherwise
            // the burn proof might be verified on a newer contract status (because of
            // rolling over in the next epoch) and get rejected.
            if (3100 > wait) { // determined empirically. IBFT, block time 1
                console.log("Initiating withdrawal.");
                return sleep(wait).then(() => this.withdraw(value));
            }

            return new Promise((resolve, reject) => {
                that.suter.methods.getBalance([account.publicKeySerialized()], that._getEpoch())
                    .call()
                    .then((result) => {
                        var encBalance = elgamal.unserialize(result[0]);
                        var encNewBalance = elgamal.serialize(elgamal.subPlain(encBalance, value));
                        var proof = service.proveBurn(
                            encNewBalance[0], 
                            encNewBalance[1], 
                            account.publicKeySerialized(), 
                            state.lastRollOver, 
                            home, 
                            account.privateKey(),
                            state.available - value
                        ); 
                        var u = bn128.serialize(utils.u(state.lastRollOver, account.privateKey()));
                        that.suter.methods.burn(account.publicKeySerialized(), value, u, proof)
                            .send({from: that.home, gas: that.gasLimit})
                            .on('transactionHash', (hash) => {
                                console.log("Withdrawal submitted (txHash = \"" + hash + "\").");
                            })
                            .on('receipt', (receipt) => {
                                account._state = account.update();
                                account._state.nonceUsed = true;
                                account._state.pending -= value;
                                console.log("Withdrawal of " + value + " was successful. Balance now " + account.balance() + ".");
                                console.log("--- Withdrawal uses gas: " + receipt["gasUsed"]);
                                resolve(receipt);
                            })
                            .on('error', (error) => {
                                console.log("Withdrawal failed: " + error);
                                reject(error);
                            });
                    });
            });
            

        };


        /*
        Estimation of running time for a transfer.
        */
        var estimate = (size, contract) => {
            // this expression is meant to be a relatively close upper bound of the time that proving + a few verifications will take, as a function of anonset size
            // this function should hopefully give you good epoch lengths also for 8, 16, 32, etc... if you have very heavy traffic, may need to bump it up (many verifications)
            // i calibrated this on _my machine_. if you are getting transfer failures, you might need to bump up the constants, recalibrate yourself, etc.
            return Math.ceil(size * Math.log(size) / Math.log(2) * 20 + 5200) + (contract ? 20 : 0);
            // the 20-millisecond buffer is designed to give the callback time to fire (see below).
        };

        /*
        Swap two values in an array.
        */
        var swap = (y, i, j) => {
            var temp = y[i];
            y[i] = y[j];
            y[j] = temp;
        };

        /**
        [Transaction]
        Transfer a given amount of tokens from this Suter account to a given receiver, if there is sufficient balance.
        
        The amount is represented in terms of a pre-defined unit. For example, if one unit represents 0.01 ETH,
        then an amount of 100 represents 1 ETH.

        @param receiver A serialized public key representing a Suter receiver.
        @param value The amount to be transfered, in terms of unit.

        @return A promise that is resolved (or rejected) with the execution status of the deposit transaction. 
        */
        this.transfer = (receiver, value) => {
            that.checkRegistered();
            that.checkValue();
            var account = that.account;
            var state = account.update();
            if (value > account.balance())
                throw "Requested transfer amount of " + value + " exceeds account balance of " + account.balance() + ".";
            var wait = that._away();
            var seconds = Math.ceil(wait / 1000);
            var plural = seconds == 1 ? "" : "s";

            if (value > state.available) {
                console.log("Your transfer has been queued. Please wait " + seconds + " second" + plural + " for the release of your funds...");
                return sleep(wait).then(() => that.transfer(receiver, value));
            }
            if (state.nonceUsed) {
                console.log("[Nonce used] Your transfer has been queued. Please wait " + seconds + " second" + plural + " until the next epoch...");
                return sleep(wait).then(() => that.transfer(receiver, value));
            }

            const anonymitySize = 2;
            var estimated = estimate(anonymitySize, false);
            if (estimated > that.epochLength * 1000)
                throw "The anonymity size (" + anonymitySize + ") you've requested might take longer than the epoch length (" + that.epochLength + " seconds) to prove. Consider re-deploying, with an epoch length at least " + Math.ceil(estimate(anonymitySize, true) / 1000) + " seconds.";

            // Heuristic condition to help reduce the possibility of failed transaction.
            // If the estimated execution time is longer than the remaining time of this epoch, then 
            // we should just wait until the epoch, otherwise it might happend that:
            // This transfer's ZK proof is generated on Suter contract status X, but after 'wait', the
            // contract gets rolled over, leading to Suter contract status Y, while this transfer will be
            // verified on status Y and get rejected (this will likely happend because we estimate that the 
            // transfer cannot complete in this epoch and thus will not be included in any block).
            if (estimated > wait) {
                console.log("[Not enough epoch time] Your transfer has been queued. Please wait " + seconds + " second" + plural + ", until the next epoch...");
                return sleep(wait).then(() => that.transfer(receiver, value));
            }

            receiver = bn128.unserialize(receiver);
            if (bn128.pointEqual(receiver, account.publicKey()))
                throw "Sending to yourself is currently unsupported.";

            var y = [account.publicKey()].concat([receiver]);
            var index = [0, 1]; 
            if (Math.round(Math.random()) == 1) {
                // shuffle sender and receiver
                swap(y, 0, 1);
                swap(index, 0, 1);
            }

            var serializedY = y.map(bn128.serialize);
            return new Promise((resolve, reject) => {
                that.suter.methods.getBalance(serializedY, that._getEpoch())
                    .call()
                    .then((result) => {

                        var unserialized = result.map((ct) => elgamal.unserialize(ct)); 
                        if (unserialized.some((ct) => ct[0].eq(bn128.zero) && ct[1].eq(bn128.zero)))
                            return reject(new Error("Please make sure both sender and receiver are registered."));

                        var r = bn128.randomScalar();

                        var ciphertexts = []; 
                        ciphertexts[index[0]] = elgamal.encrypt(new BN(-value), y[index[0]], r); 
                        ciphertexts[index[1]] = elgamal.encrypt(new BN(value), y[index[1]], r); 

                        var C = [ciphertexts[0][0], ciphertexts[1][0]];
                        var D = ciphertexts[0][1]; // same as ciphertexts[1][1]
                        var CL = unserialized.map((ct, i) => ct[0].add(C[i]));
                        var CR = unserialized.map((ct) => ct[1].add(D));

                        var proof = service.proveTransfer(
                            CL, CR, 
                            C, D, 
                            y, 
                            state.lastRollOver, 
                            account.privateKey(), 
                            r, 
                            value,
                            state.available - value,
                            index
                        );

                        var u = bn128.serialize(utils.u(state.lastRollOver, account.privateKey()));

                        C = C.map(bn128.serialize);
                        D = bn128.serialize(D);

                        that.suter.methods.transfer(C, D, serializedY, u, proof)
                            .send({from: that.home, gas: that.gasLimit})
                            .on('transactionHash', (hash) => {
                                that._transfers.add(hash);
                                console.log("Transfer submitted (txHash = \"" + hash + "\")");
                            })
                            .on('receipt', (receipt) => {
                                account._state = account.update();
                                account._state.nonceUsed = true;
                                account._state.pending -= value;
                                console.log("Transfer of " + value + " was successful. Balance now " + account.balance() + ".");
                                console.log("--- Transfer uses gas: " + receipt["gasUsed"]);
                                resolve(receipt);
                            })
                            .on('error', (error) => {
                                console.log("Transfer failed: " + error);
                                reject(error);
                            });

                    });
            });

        };

        /**
        [Transaction]
        Transfer a given amount of tokens from this Suter account to a given receiver, if there is sufficient balance.
        
        The amount is represented in terms of a pre-defined unit. For example, if one unit represents 0.01 ETH,
        then an amount of 100 represents 1 ETH.

        @param receiver A Client object.
        @param value The amount to be transfered, in terms of unit.

        @return A promise that is resolved (or rejected) with the execution status of the deposit transaction. 
        */
        this.transferToClient = (receiver, value) => {
            return this.transfer(receiver.account.publicKeySerialized(), value);
        };

    }

}

module.exports = Client;
