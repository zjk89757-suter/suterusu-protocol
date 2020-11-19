const ClientBase = require('./client_base.js');

class ClientSuterETH extends ClientBase {
    
    constructor(web3, suter, home) {
        super(web3, suter, home);
    }

    deposit (value) {
        var that = this;
        that.checkRegistered();
        that.checkValue();
        var account = that.account;
        console.log("Initiating deposit: value of " + value + " units (" + value * that.unit + " wei)");
        return new Promise((resolve, reject) => {
            that.suter.methods.fund(account.publicKeySerialized(), value)
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
    }

}

module.exports = ClientSuterETH;
