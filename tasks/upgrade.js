const { task } = require("hardhat/config");
const upgradeContract = require("../scripts/upgrade/00_upgrade_contract");

task("upgrade", "Upgrades a contract")
  .addParam("contract", "The name of the contract")
  .addParam("address", "The address of the deployed contract")
  .setAction(async (taskArgs, hre) => {
    const { contract, address } = taskArgs;

    const result = await upgradeContract(contract, address);
    console.log(`Upgraded contract: ${result.proxy}`);
    console.log(`Implementation contract: ${result.implementation}`);
  });