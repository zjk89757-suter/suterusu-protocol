const SuterETH = artifacts.require('SuterETH');
const Client = require('../lib/client_sutereth.js');

contract("SuterETH", async (accounts) => {
    let alice;
    let bob;

    it("should allow register", async () => {
        let suter = (await SuterETH.deployed()).contract;
        alice = new Client(web3, suter, accounts[0]);
        await alice.init();
        await alice.register();
        assert.exists(
            alice.account.keypair,
            "Registration failed"
        );
    });

    it("should allow funding", async () => {
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
        let suter = (await SuterETH.deployed()).contract;
        bob = new Client(web3, suter, accounts[1]);
        await bob.init();
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

    it("should allow account recovery", async () => {
        let suter = (await SuterETH.deployed()).contract;
        let eve = new Client(web3, suter, accounts[2]);
        await eve.init();
        await eve.register("test secret");
        assert.exists(
            eve.account.keypair,
            "Registration failed"
        );

        await eve.deposit(1);
        let balance = await eve.readBalanceFromContract();
        assert.equal(
            balance,
            1,
            "Wrong balance"
        );
        let localTrackedBalance = eve.account.balance();
        assert.equal(
            balance,
            localTrackedBalance,
            "Contract balance does not match locally tracked balance"
        );

        await eve.withdraw(balance); 
        let balance1 = eve.account.balance();
        let balance2 = await eve.readBalanceFromContract(); 
        assert.equal(
            balance1,
            0,
            "Wrong locally tracked balance after withdrawing"
        );
        assert.equal(
            balance2,
            0,
            "Wrong contract balance after withdrawing"
        );

        // Recover the account
        let new_eve = new Client(web3, suter, accounts[2]);
        await new_eve.init();
        await new_eve.register("test secret");
        await new_eve.deposit(100);
    });

});
