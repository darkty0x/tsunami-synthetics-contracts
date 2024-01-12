const hre = require("hardhat");

async function deployLiquidateVault() {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const LiquidateVault = await hre.ethers.getContractFactory("LiquidateVault");

  const liquidateVault = await hre.upgrades.deployProxy(LiquidateVault, [], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await liquidateVault.deployed();

  console.log(`LiquidateVault deployed to ${liquidateVault.address}`);

  return { liquidateVault, liquidateVaultAddress: liquidateVault.address };
}

async function liquidateVault_init(liquidateVault, positionVaultAddress, settingsManagerAddress, vaultAddress, priceManagerAddress, operatorsAddress) {
  await liquidateVault.init(positionVaultAddress, settingsManagerAddress, vaultAddress, priceManagerAddress, operatorsAddress);

  console.log(`LiquidateVault init success`);
}

module.exports = {
  deployLiquidateVault,
  liquidateVault_init,
};