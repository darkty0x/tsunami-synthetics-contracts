const deployOperators = require('./01_deploy_Operator');
const deployVela = require('./02_deploy_Vela_NotRequired');
const deployEVela = require('./03_deploy_eVELA_NotRequired');
const deployVLP = require('./04_deploy_VLP_NotRequired');
const deployVUSD = require('./05_deploy_VUSD_NotRequired');
const deployTokenFarm = require('./06_deploy_TokenFarm_NotRequired');
const deployPriceManager = require('./07_deploy_PriceManager');
const { deployVault, vault_setVaultSettings, vault_setUSDC } = require('./08_deploy_Vault');
const { deployPositionVault, positionVault_init } = require('./09_deploy_PositionVault');
const { deployOrderVault, orderVault_init } = require('./10_deploy_OrderVault');
const { deployLiquidateVault, liquidateVault_init } = require('./11_deploy_LiquidateVault');
const deploySettingsManager = require('./12_deploy_SettingsManager');
const deployReader = require('./13_deploy_Reader');
const deployReaderV2 = require('./14_deploy_ReaderV2');

async function main() {
  // const USDC_ADDRESS = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9';

  const operatorsAddress = await deployOperators();
  const velaAddress = await deployVela();
  const eVelaAddress = await deployEVela();
  const vlpAddress = await deployVLP();
  const vusdAddress = await deployVUSD();
  // Temporary
  const USDC_ADDRESS = vusdAddress;
  
  const tokenFarmAddress = await deployTokenFarm(velaAddress, eVelaAddress, vlpAddress, operatorsAddress);
  const priceManagerAddress = await deployPriceManager(operatorsAddress);
  const { vault, vaultAddress } = await deployVault(operatorsAddress, vlpAddress, vusdAddress);
  const { positionVault, positionVaultAddress } = await deployPositionVault(vaultAddress, priceManagerAddress, operatorsAddress);
  const { orderVault, orderVaultAddress } = await deployOrderVault();
  const { liquidateVault, liquidateVaultAddress } = await deployLiquidateVault();
  const settingsManagerAddress = await deploySettingsManager(liquidateVaultAddress, positionVaultAddress, operatorsAddress, vusdAddress, tokenFarmAddress);

  await vault_setVaultSettings(vault, priceManagerAddress, settingsManagerAddress, positionVaultAddress, orderVaultAddress, liquidateVaultAddress);
  await vault_setUSDC(vault, USDC_ADDRESS);

  await positionVault_init(positionVault, orderVaultAddress, liquidateVaultAddress, priceManagerAddress);

  await orderVault_init(orderVault, priceManagerAddress, positionVaultAddress, settingsManagerAddress, vaultAddress, operatorsAddress);

  await liquidateVault_init(liquidateVault, positionVaultAddress, settingsManagerAddress, vaultAddress, priceManagerAddress, operatorsAddress);

  const readerAddress = await deployReader(positionVaultAddress, orderVaultAddress, settingsManagerAddress, tokenFarmAddress, vaultAddress, USDC_ADDRESS, vusdAddress, vlpAddress, velaAddress, eVelaAddress);
  const readerV2Address = await deployReaderV2(vaultAddress, positionVaultAddress, orderVaultAddress, settingsManagerAddress, tokenFarmAddress, eVelaAddress, velaAddress, vlpAddress, USDC_ADDRESS, vusdAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});