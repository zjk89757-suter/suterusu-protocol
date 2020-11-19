const SuterERC20 = artifacts.require('SuterERC20');
const TestERC20Token = artifacts.require('TestERC20Token');
const Client = require('../src/client_sutererc20.js');

contract("SuterERC20", async (accounts) => {
    let alice;
    let bob;

    it("should allow register", async () => {
        let suter = (await SuterERC20.deployed()).contract;
        let erc20Token = (await TestERC20Token.deployed()).contract; 
        alice = new Client(web3, suter, accounts[0], erc20Token);
        await alice.register();
        assert.exists(
            alice.account.keypair,
            "Registration failed"
        );
    });

    it("should allow funding", async () => {
        let erc20Token = (await TestERC20Token.deployed()).contract;
        await new Promise((resolve, reject) => {
            erc20Token.methods.mint(accounts[0], 200)
                .send({from: accounts[0], gas: 4700000})
                .on("receipt", (receipt) => {
                    erc20Token.methods.balanceOf(accounts[0])
                        .call()
                        .then((result) => {
                            console.log("ERC20 funds minted (balance = " + result + ").");
                            resolve(receipt);
                        });
                })
                .on("error", (error) => {
                    reject(error);
                });
        });

        await alice.deposit(100);
    });

    it("should allow reading balance", async () => {
        let balance = await alice.readBalanceFromContract();
        assert.equal(
            balance,
            100,
            "Wrong balance"
        );
        let localTrackedBalance = alice.account.balance();
        assert.equal(
            balance,
            localTrackedBalance,
            "Contract balance does not match locally tracked balance"
        );
    });

    it("should allow withdrawing", async () => {
        await alice.withdraw(50); 
        let balance1 = alice.account.balance();
        let balance2 = await alice.readBalanceFromContract(); 
        assert.equal(
            balance1,
            50,
            "Wrong locally tracked balance after withdrawing"
        );
        assert.equal(
            balance2,
            50,
            "Wrong contract balance after withdrawing"
        );
    });

    it("should allow transfer", async () => {
        let suter = (await SuterERC20.deployed()).contract;
        let erc20Token = (await TestERC20Token.deployed()).contract;
        bob = new Client(web3, suter, accounts[1], erc20Token);
        await bob.register();
        await alice.transferToClient(bob, 30);
        let aliceBalance = await alice.readBalanceFromContract();
        let bobBalance = await bob.readBalanceFromContract();
        assert.equal(
            aliceBalance,
            20,
            "Wrong balance for alice after transfering"
        );
        assert.equal(
            bobBalance,
            30,
            "Wrong balance for bob after transfering"
        );

        // Need to synchronize bob's account because Truffle test didn't handle events.
        await bob.syncAccountState();
        await bob.withdraw(30);
        bobBalance = await bob.readBalanceFromContract();
        assert.equal(
            bobBalance,
            0,
            "Wrong balance for bob after withdrawing"
        );
    });

});
