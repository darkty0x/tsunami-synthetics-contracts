const hre = require("hardhat");

async function deployPositionVault(vaultAddress, priceManagerAddress, operatorsAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const PositionVault = await hre.ethers.getContractFactory("PositionVault");

  const positionVault = await hre.upgrades.deployProxy(PositionVault, [
    vaultAddress,
    priceManagerAddress,
    operatorsAddress,
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await positionVault.deployed();

  console.log(`PositionVault deployed to ${positionVault.address}`);

  return { positionVault, positionVaultAddress: positionVault.address };
}

async function positionVault_init(positionVault, orderVaultAddress, liquidateVaultAddress, settingsManagerAddress) {
  await positionVault.init(orderVaultAddress, liquidateVaultAddress, settingsManagerAddress);
  
  console.log(`PositionVault init success`);
}

module.exports = {
  deployPositionVault,
  positionVault_init,
};