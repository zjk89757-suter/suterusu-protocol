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
