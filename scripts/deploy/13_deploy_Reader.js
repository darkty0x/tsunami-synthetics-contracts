const hre = require("hardhat");

async function deployReader(positionVaultAddress, orderVaultAddress, settingsManagerAddress, tokenFarmAddress, vaultAddress, usdcAddress, vusdAddress, vlpAddress, velaAddress, eVelaAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const Reader = await hre.ethers.getContractFactory("Reader");

  const reader = await hre.upgrades.deployProxy(Reader, [
    positionVaultAddress,
    orderVaultAddress,
    settingsManagerAddress,
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await reader.deployed();

  console.log(`Reader deployed to ${reader.address}`);

  await reader.initializeV2(tokenFarmAddress);

  console.log(`Reader initialized V2`);

  await reader.initializeV3(vaultAddress, usdcAddress, vusdAddress, vlpAddress, velaAddress, eVelaAddress);

  console.log(`Reader initialized V3`);

  return reader.address;
}

module.exports = deployReader;