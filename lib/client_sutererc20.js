
const ClientBase = require('./client_base.js');

class ClientSuterERC20 extends ClientBase {
    
    constructor(web3, suter, home, erc20Token) {
        super(web3, suter, home);
        if (erc20Token === undefined)
            throw "4th arg should be an ERC20 contract.";
        
        console.log("ERC20 contract: " + erc20Token.options.address);

        this.erc20Token = erc20Token;
    }

    async deposit (value) {
        var that = this;
        that.checkRegistered();
        that.checkValue();
        var account = that.account;
        console.log("Initiating deposit: value of " + value + " units (" + value * that.unit + " tokens)");
        await that.erc20Token.methods.approve(that.suter.options.address, value * that.unit)
                .send({from: that.home, gas: that.gasLimit});

        console.log("ERC20 tokens approved. Start deposit...");

        let transaction = that.suter.methods.fund(account.publicKeySerialized(), value)
            .send({from: that.home, gas: that.gasLimit})
            .on('transactionHash', (hash) => {
                console.log("Deposit submitted (txHash = \"" + hash + "\").");
            })
            .on('receipt', (receipt) => {
                account._state = account.update();
                account._state.pending += value;
                console.log("Deposit of " + value + " was successful. Balance now " + account.balance() + ".");
                console.log("--- Deposit uses gas: " + receipt["gasUsed"]);
            })
            .on('error', (error) => {
                console.log("Deposit failed: " + error);
            });
        return transaction;
    }

}

module.exports = ClientSuterERC20;
