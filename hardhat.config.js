require("dotenv").config({ path: "./.env" });
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("hardhat-watcher");
require("hardhat-abi-exporter");
require("hardhat-deploy");

// Tasks
require("./tasks/upgrade");

module.exports = {
  abiExporter: {
    path: "./abis",
    clear: true,
    flat: true,
    pretty: true,
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      fork: "https://rpc.mantle.xyz/",
    },
    mantle: {
      url: "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts: [
        `${process.env.MANTLE_MAINNET_DEPLOYER_PRIVATE_KEY}`, 
        `${process.env.MANTLE_MAINNET_ADMIN_PRIVATE_KEY}`, 
        `${process.env.MANTLE_MAINNET_REWARD_AND_FEE_MANAGER_PRIVATE_KEY}`, 
        `${process.env.MANTLE_MAINNET_NORMAL_OPERATOR_PRIVATE_KEY}`,
        `${process.env.MANTLE_MAINNET_TRUSTED_FORWARDER_PRIVATE_KEY}`,
      ],
    },
    mantleTestnet: {
      url: "https://rpc.testnet.mantle.xyz",
      chainId: 5001,
      accounts: [
        `${process.env.MANTLE_TESTNET_DEPLOYER_PRIVATE_KEY}`, 
        `${process.env.MANTLE_TESTNET_ADMIN_PRIVATE_KEY}`, 
        `${process.env.MANTLE_TESTNET_REWARD_AND_FEE_MANAGER_PRIVATE_KEY}`, 
        `${process.env.MANTLE_TESTNET_NORMAL_OPERATOR_PRIVATE_KEY}`,
        `${process.env.MANTLE_TESTNET_TRUSTED_FORWARDER_PRIVATE_KEY}`,
      ],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
      5001: 0,
    },
    admin: {
      default: 1,
      5001: 1,
    },
    rewardAndFeeManager: {
      default: 2,
      5001: 2,
    },
    normalOperator: {
      default: 3,
      5001: 3,
    },
    trustedForwarder: {
      default: 4,
      5001: 4,
    }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  mocha: {
    timeout: 360000,
  },
  etherscan: {
    apiKey: process.env.API_KEY,
    customChains: [
      {
        network: "mantleTest",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
    ]
  },
  watcher: {
    compile: {
      tasks: ["compile"],
      files: ["./contracts"],
      verbose: true,
    },
  },
};
