const hre = require("hardhat");

async function deploySettingsManager(liquidateVaultAddress, positionVaultAddress, operatorsAddress, vusdAddress, tokenFarmAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const SettingsManager = await hre.ethers.getContractFactory("SettingsManager");

  const settingsManager = await hre.upgrades.deployProxy(SettingsManager, [
    liquidateVaultAddress,
    positionVaultAddress,
    operatorsAddress,
    vusdAddress,
    tokenFarmAddress,
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await settingsManager.deployed();

  console.log(`SettingsManager deployed to ${settingsManager.address}`);

  // TODO

  return settingsManager.address;
}

module.exports = deploySettingsManager;