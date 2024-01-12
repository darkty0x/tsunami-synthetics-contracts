const hre = require("hardhat");

async function deployVault(operatorsAddress, vlpAddress, vusdAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const Vault = await hre.ethers.getContractFactory("Vault");

  const vault = await hre.upgrades.deployProxy(Vault, [
    operatorsAddress,
    vlpAddress,
    vusdAddress,
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await vault.deployed();

  console.log(`Vault deployed to ${vault.address}`);

  return { vault, vaultAddress: vault.address };
}

async function vault_setVaultSettings(vault, priceManagerAddress, settingsManagerAddress, positionVaultAddress, orderVaultAddress, liquidateVaultAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const deployerSigner = hre.ethers.provider.getSigner(deployer);

  await vault.connect(deployerSigner).setVaultSettings(priceManagerAddress, settingsManagerAddress, positionVaultAddress, orderVaultAddress, liquidateVaultAddress);
  
  console.log(`Vault set settings success`);
}

async function vault_setUSDC(vault, usdcAddress) {
  const { getNamedAccounts } = hre;
  const { admin } = await getNamedAccounts();
  const adminSigner = hre.ethers.provider.getSigner(admin);

  await vault.connect(adminSigner).setUSDC(usdcAddress);

  console.log(`Vault set USDC to ${usdcAddress}`);
}

module.exports = {
  deployVault,
  vault_setVaultSettings,
  vault_setUSDC
};