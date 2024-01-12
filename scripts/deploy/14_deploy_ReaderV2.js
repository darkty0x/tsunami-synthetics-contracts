const hre = require("hardhat");

async function deployReaderV2(vaultAddress, positionVaultAddress, orderVaultAddress, settingsManagerAddress, tokenFarmAddress, eVelaAddress, velaAddress, vlpAddress, usdcAddress, vusdAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const ReaderV2 = await hre.ethers.getContractFactory("ReaderV2");

  const readerV2 = await hre.upgrades.deployProxy(ReaderV2, [
    vaultAddress,
    positionVaultAddress,
    orderVaultAddress,
    settingsManagerAddress,
    tokenFarmAddress,
    eVelaAddress,
    velaAddress,
    vlpAddress,
    usdcAddress,
    vusdAddress,
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await readerV2.deployed();

  console.log(`ReaderV2 deployed to ${readerV2.address}`);

  // TODO

  return readerV2.address;
}

module.exports = deployReaderV2;