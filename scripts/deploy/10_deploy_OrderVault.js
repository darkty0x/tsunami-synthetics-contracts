const hre = require("hardhat");

async function deployOrderVault() {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const OrderVault = await hre.ethers.getContractFactory("OrderVault");

  const orderVault = await hre.upgrades.deployProxy(OrderVault, [], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await orderVault.deployed();

  console.log(`OrderVault deployed to ${orderVault.address}`);
  
  return { orderVault, orderVaultAddress: orderVault.address };
}

async function orderVault_init(orderVault, priceManagerAddress, positionVaultAddress, settingsManagerAddress, vaultAddress, operatorsAddress) {
  await orderVault.init(priceManagerAddress, positionVaultAddress, settingsManagerAddress, vaultAddress, operatorsAddress);
  
  console.log(`OrderVault init success`);
}

module.exports = {
  deployOrderVault,
  orderVault_init,
};