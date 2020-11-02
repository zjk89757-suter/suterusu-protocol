var CashToken = artifacts.require("CashToken");
var ETHToken = artifacts.require("ETHToken");
var ETHToken2 = artifacts.require("ETHToken2");
var Test = artifacts.require("Test");
var Utils = artifacts.require("Utils");
var SuterETH = artifacts.require("SuterETH");

module.exports = function(deployer) {
    deployer.deploy(Utils);
    deployer.link(Utils, SuterETH);
    deployer.deploy(SuterETH, 6);
};
