
const ClientBase = require('./client_base.js');

class ClientSuterERC20 extends ClientBase {
    
    constructor(web3, suter, home, erc20Token) {
        super(web3, suter, home);
        if (erc20Token === undefined)
            throw "4th arg should be an ERC20 contract.";
        
        console.log("ERC20 contract: " + erc20Token.options.address);

        this.erc20Token = erc20Token;
    }

    deposit (value) {
        var that = this;
        that.checkRegistered();
        that.checkValue();
        var account = that.account;
        console.log("Initiating deposit: value of " + value + " units (" + value * that.unit + " tokens)");
        return new Promise((resolve, reject) => {
            that.erc20Token.methods.approve(that.suter.options.address, value * that.unit)
                .send({from: that.home, gas: that.gasLimit})
                .then((receipt) => {
                    that.suter.methods.fund(account.publicKeySerialized(), value)
                        .send({from: that.home, gas: that.gasLimit})
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
            
        });
    }

}

module.exports = ClientSuterERC20;
