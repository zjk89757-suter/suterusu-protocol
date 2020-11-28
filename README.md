# Suterusu Protocol 

Suterusu is a protocol that allows users to protect payment anonymity and confidentiality on the Ethereum network. It includes a set of backend contracts that maintain funds and actions on funds in encrypted forms, and a series of correspoding frontend user algorithms to interact with the contracts. Suterusu supports both ETH and any ERC20 token. On the high level, Suterusu can be viewed as an agency that workds on encrypted ETH and ERC20 tokens, and whose confidentiality and
anonymity are guaranteed by well-established cryptographic techniques. We briefly introduce the main functionalities below (using ERC20 as an example).

## Register
#### [Frontend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/src/client_base.js#L282)
User inputs his or her private `secret` and the algorithm will generate a Suterusu public/private key pair. The Suterusu public key will be sent in a transaction to register an account in the contract.

#### [Backend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/contracts/SuterBase.sol#L62)
Register the Suterusu public key, and initialize the corresponding account status. 


## Fund
#### [Frontend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/src/client_sutererc20.js#L16)
Create a transaction to convert a specified amount of the user's ERC20 tokens to an equivalent amount of encrypted Suterusu ERC20 tokens.

#### [Backend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/contracts/SuterERC20.sol#L18)
1. Add the specified amount to the account's encrypted balance.
2. Transfer the specified amount of ERC20 tokens from the message sender to the contract. 


## Transfer
#### [Frontend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/src/client_base.js#L420)
Create a transaction to transfer a specified amount of the user's ERC20 tokens from the current user to a receiver. Note that the transaction will include necessary cryptographic zero-knowledge proof to guarantee that this is a ***valid*** transfer operation.

#### [Backend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/contracts/SuterBase.sol#L170)
1. Verify that this operation is valid: the sender has sufficient balance, and the same amount is deducted from the sender's account and added to the receiver's account.
2. Transfer a specified encrypted amount of balance from a sender to a receiver

## Burn
#### [Frontend](https://github.com/zjk89757-suter/hi/blob/3ddb1e84740716ed88af368a847782b9162fd6b1/src/client_base.js#L344)
Create a transaction to convert a specified amount of the user's encrypted Suterusu ERC20 tokens back to an equivalent amount of plain ERC20 tokens. Note that the transaction will include necessary cryptographic zero-knowledge proof to guarantee that this is a **valid** burn operation. 

#### [Backend](https://github.com/zjk89757-suter/hi/blob/af7e5bf6d7f76760047b1aeec279047e91e31a68/contracts/SuterERC20.sol#L27)
1. Verify that this operation is valid: the account has sufficient balance.
2. Deduct the specified amount of tokens from the account's encrypted balance;
3. Transfer the specified amount of ERC20 tokens from the contract to the message sender. 


# Environment Setup

1. Install node.js and npm (on MacOS)
```bash
brew install node 
```

2. Install Truffle
```bash
npm install -g truffle
truffle version
```

3. Install OpenZeppelin contracts. At the root of this project,
```bash
npm install openzeppelin-solidity
```

4. Install `web3`, `bn.js`, `elliptic`. At the root of this project,
```bash
npm install web3
npm install bn.js
npm install elliptic
```

5. Install [Ganache](https://www.trufflesuite.com/ganache) for launching a test blockchain.


# Compile and Test

1. Compile the contract
```bash
truffle compile
```

2. Deploy the contract to the test blockchain of Ganache
```bash
truffle migrate --reset
```

3. Run the test (located at `./test/suter_eth.js`)
```bash
truffle test
```


# Local Installation of Suterusu Client
Git clone the repository:
```bash
git clone https://github.com/zjk89757-suter/Suterusu-Protocol.git
```

Link the Sutersusu module to the global `node_modules` directory:
```bash
cd Suterusu-Protocol
npm link
```

In any project where you want to use Suterusu, link the globally installed Suterusu to the local `node_modules` directory:
```bash
## Run this command in your other project root
npm link suterusu 
```


