var TestERC20Token = artifacts.require("TestERC20Token");
var Utils = artifacts.require("Utils");
var InnerProductVerifier = artifacts.require("InnerProductVerifier");
var BurnVerifier = artifacts.require("BurnVerifier");
var TransferVerifier = artifacts.require("TransferVerifier");
var SuterETH = artifacts.require("SuterETH");
var SuterERC20 = artifacts.require("SuterERC20");

module.exports = function(deployer) {
    //deployer.deploy(Utils);
    //deployer.link(Utils, SuterETH);
    //deployer.deploy(SuterETH, 6);
    //deployer.deploy(InnerProductVerifier);

    console.log("Deploying Utils, TestERC20Token...");
    return Promise.all([
        deployer.deploy(Utils),
        deployer.deploy(TestERC20Token),
        deployer.deploy(InnerProductVerifier)
    ])
    //.then(() => {
        //deployer.link(Utils, InnerProductVerifier);
        //console.log("Deploying InnerProductVerifier...");
        //return Promise.all([deployer.deploy(InnerProductVerifier)]);
    //})
        //return deployer.link(Utils, InnerProductVerifier);
    //})
    //.then(() => {
        //console.log("Deploying InnerProductVerifier...");
        //return Promise.all([deployer.deploy(InnerProductVerifier)]);
    //})
    .then(() => {
        console.log("Deploying BurnVerifier, TransferVerifier...");
        //deployer.link(Utils, [BurnVerifier, TransferVerifier]);
        return Promise.all([
            deployer.deploy(BurnVerifier, InnerProductVerifier.address),
            deployer.deploy(TransferVerifier, InnerProductVerifier.address)
        ]);
    }).then(() => {
        console.log("Deploying SuterETH, SuterERC20...");
        //deployer.link(Utils, [SuterETH, SuterERC20]);
        return Promise.all([
            // Should use string for large number. This seems to be a bug:
            // https://github.com/ethereum/web3.js/issues/2077
            deployer.deploy(SuterETH, TransferVerifier.address, BurnVerifier.address, 6, "10000000000000000"),
            deployer.deploy(SuterERC20, TestERC20Token.address, TransferVerifier.address, BurnVerifier.address, 6, 1)
        ]);
    });
};
