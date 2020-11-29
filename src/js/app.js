const Client = require("suterusu").ClientSuterERC20;
App = {
  web3Provider: null,
  contracts: {},
    suterClient: null,

  init: function() {
    return App.initWeb3();
  },

  initWeb3: async function() {
    // Modern dapp browsers
    if (window.ethereum) {
        App.web3Provider = window.ethereum;
        try {
            // Request account access
            await window.ethereum.enable();
        } catch (error) {
            // User denied account access
            console.error("User denied account access");
        }
    }
    // Legacy dapp browsers
    else if (window.web3) {
        App.web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
        App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
    }
    web3 = new Web3(App.web3Provider);

    return App.initContract();
  },

  initContract: async function() {
      let abi = await $.getJSON('TestERC20Token.json');
      App.contracts.TestERC20Token = TruffleContract(abi);
      // Set the provider for our contract.
      App.contracts.TestERC20Token.setProvider(App.web3Provider);
      App.contracts.erc20Token = (await App.contracts.TestERC20Token.deployed()).contract;
      App.getBalances();


      abi = await $.getJSON('SuterERC20.json');
      App.contracts.SuterERC20 = TruffleContract(abi);
      App.contracts.SuterERC20.setProvider(App.web3Provider);
      App.contracts.suterERC20 = (await App.contracts.SuterERC20.deployed()).contract;

      let accounts = await web3.eth.getAccounts();
      App.suterClient = new Client(web3, App.contracts.suterERC20, accounts[0], App.contracts.erc20Token); 




    //$.getJSON('TestERC20Token.json', function(data) {
      //// Get the necessary contract artifact file and instantiate it with truffle-contract.
      //var TutorialTokenArtifact = data;
      //App.contracts.TestERC20Token = TruffleContract(TutorialTokenArtifact);
      //// Set the provider for our contract.
      //App.contracts.TestERC20Token.setProvider(App.web3Provider);

        //App.contracts.erc20Token = App.contracts.TestERC20Token.deployed();
        //console.log(App.contracts.erc20Token);
        //console.log("erc20token");

      //// Use our contract to retieve and mark the adopted pets.
      //return App.getBalances();
    //});

    //$.getJSON('SuterERC20.json', async function(data) {
      //// Get the necessary contract artifact file and instantiate it with truffle-contract.
      //var TutorialTokenArtifact = data;
      //App.contracts.SuterERC20 = TruffleContract(TutorialTokenArtifact);
      //// Set the provider for our contract.
      //App.contracts.SuterERC20.setProvider(App.web3Provider);

        //App.contracts.suter = await App.contracts.SuterERC20.deployed();
    //});

    return App.bindEvents();
  },

  bindEvents: function() {
    $(document).on('click', '#transferButton', App.handleTransfer);
    $(document).on('click', '#fundButton', App.handleFund);
  },

  handleTransfer: function(event) {
    event.preventDefault();

    var amount = parseInt($('#TTTransferAmount').val());
    var toAddress = $('#TTTransferAddress').val();

    console.log('Transfer ' + amount + ' TT to ' + toAddress);

    var tutorialTokenInstance;

    web3.eth.getAccounts(function(error, accounts) {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];

      App.contracts.TestERC20Token.deployed().then(function(instance) {
        tutorialTokenInstance = instance;

        return tutorialTokenInstance.transfer(toAddress, amount, {from: account, gas: 100000});
      }).then(function(result) {
        alert('Transfer Successful!');
        return App.getBalances();
      }).catch(function(err) {
        console.log(err.message);
      });
    });
  },

  handleFund: async function(event) {
    event.preventDefault();

    var amount = parseInt($('#FundAmount').val());

    console.log('Fund ' + amount);
    let accounts = await web3.eth.getAccounts();
      console.log(accounts);

    await new Promise((resolve, reject) => {
            App.contracts.erc20Token.methods.mint(accounts[0], 200)
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

      App.getBalances();

    //var tutorialTokenInstance;

    //web3.eth.getAccounts(function(error, accounts) {
      //if (error) {
        //console.log(error);
      //}

      //var account = accounts[0];
      

      //App.contracts.TestERC20Token.deployed().then(function(instance) {
        //tutorialTokenInstance = instance;

        //return tutorialTokenInstance.transfer(toAddress, amount, {from: account, gas: 100000});
      //}).then(function(result) {
        //alert('Transfer Successful!');
        //return App.getBalances();
      //}).catch(function(err) {
        //console.log(err.message);
      //});
    //});
  },


  webDeposit: async function () {
      
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

        return await alice.deposit(100);
  },

  getBalances: function() {
    console.log('Getting balances...');

    var tutorialTokenInstance;

    web3.eth.getAccounts(function(error, accounts) {
      if (error) {
        console.log(error);
      }

      var account = accounts[0];

      App.contracts.TestERC20Token.deployed().then(function(instance) {
        tutorialTokenInstance = instance;

        return tutorialTokenInstance.balanceOf(account);
      }).then(function(result) {
        //balance = result.c[0];
        balance = result;
        console.log(balance);

        $('#TTBalance').text(balance);
      }).catch(function(err) {
        console.log(err.message);
      });
    });
  }

};

$(function() {
  $(window).load(function() {
    App.init();
  });
});
