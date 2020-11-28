const Web3 = require("web3");
const InnerProductVerifier = require("../../build/contracts/InnerProductVerifier.json");
const TransferVerifier = require("../../build/contracts/TransferVerifier.json");
const BurnVerifier = require("../../build/contracts/BurnVerifier.json");
const SuterETH = require("../../build/contracts/SuterETH.json");
const SuterERC20 = require("../../build/contracts/SuterERC20.json");
const TestERC20Token = require("../../build/contracts/TestERC20Token.json");

class Deployer {
    constructor(accounts) {
        const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));
        web3.transactionConfirmationBlocks = 1;

        this.deployInnerProductVerifier = () => {
            const contract = new web3.eth.Contract(InnerProductVerifier.abi);
            return new Promise((resolve, reject) => {
                contract.deploy({ data: InnerProductVerifier.bytecode }).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        console.log("Inner product verifier mined (address = \"" + receipt.contractAddress + "\").");
                        resolve(receipt);
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        }

        this.deployTransferVerifier = (ip) => {
            const contract = new web3.eth.Contract(TransferVerifier.abi);
            return new Promise((resolve, reject) => {
                contract.deploy({ data: TransferVerifier.bytecode, arguments: [ip] }).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        console.log("Transfer verifier mined (address = \"" + receipt.contractAddress + "\").");
                        resolve(receipt);
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        };

        this.deployBurnVerifier = (ip) => {
            const contract = new web3.eth.Contract(BurnVerifier.abi);
            return new Promise((resolve, reject) => {
                contract.deploy({ data: BurnVerifier.bytecode, arguments: [ip] }).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        console.log("Burn verifier mined (address = \"" + receipt.contractAddress + "\").");
                        resolve(receipt);
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        };

        this.deployTestERC20Token = () => {
            const contract = new web3.eth.Contract(TestERC20Token.abi);
            return new Promise((resolve, reject) => {
                contract.deploy({ data: TestERC20Token.bytecode }).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        console.log("TestERC20Token contact mined (address = \"" + receipt.contractAddress + "\").");
                        resolve(receipt);
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        };

        this.mintTestERC20Token = (cash, amount) => {
            const contract = new web3.eth.Contract(TestERC20Token.abi, cash);
            return new Promise((resolve, reject) => {
                contract.methods.mint(accounts[0], amount).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        contract.methods.balanceOf(accounts[0]).call()
                            .then((result) => {
                                console.log("ERC20 funds minted (balance = " + result + ").");
                                resolve(receipt);
                            });
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        };

        this.deploySuterETH = (transfer, burn, epochLength, unit) => {
            const contract = new web3.eth.Contract(SuterETH.abi);
            return new Promise((resolve, reject) => {
                contract.deploy({ data: SuterETH.bytecode, arguments: [transfer, burn, epochLength, unit] }).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        console.log("SuterETH main contract deployed (address = \"" + receipt.contractAddress + "\").");
                        resolve(receipt);
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        };

        this.deploySuterERC20 = (cash, transfer, burn, epochLength, unit) => {
            const contract = new web3.eth.Contract(SuterERC20.abi);
            return new Promise((resolve, reject) => {
                contract.deploy({ data: SuterERC20.bytecode, arguments: [cash, transfer, burn, epochLength, unit] }).send({ from: accounts[0], gas: 4700000 })
                    .on("receipt", (receipt) => {
                        console.log("SuterERC20 main contract deployed (address = \"" + receipt.contractAddress + "\").");
                        resolve(receipt);
                    })
                    .on("error", (error) => {
                        reject(error);
                    });
            });
        };
    }
}

module.exports = Deployer;

