var CashToken = artifacts.require("CashToken");
var ETHToken = artifacts.require("ETHToken");
var ETHToken2 = artifacts.require("ETHToken2");
var Test = artifacts.require("Test");
var Utils = artifacts.require("Utils");
var InnerProductVerifier = artifacts.require("InnerProductVerifier");
var BurnVerifier = artifacts.require("BurnVerifier");
var TransferVerifier = artifacts.require("TransferVerifier");
var SuterETH = artifacts.require("SuterETH");

module.exports = function(deployer) {
    //deployer.deploy(Utils);
    //deployer.link(Utils, SuterETH);
    //deployer.deploy(SuterETH, 6);

    deployer.deploy(Utils).then(() => {
        deployer.link(Utils, [InnerProductVerifier, BurnVerifier, TransferVerifier, SuterETH]);
        return deployer.deploy(InnerProductVerifier);
    }).then(() => {
        return Promise.all([
            deployer.deploy(BurnVerifier, InnerProductVerifier.address),
            deployer.deploy(TransferVerifier, InnerProductVerifier.address)
        ]);
    }).then(() => {
        deployer.link(Utils, SuterETH);
        return deployer.deploy(SuterETH, TransferVerifier.address, BurnVerifier.address, 6); 
    });
};
