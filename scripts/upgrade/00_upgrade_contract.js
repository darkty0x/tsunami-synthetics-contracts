async function upgradeContract(contractName, proxyAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  
  const contract = await hre.ethers.getContractFactory(contractName);

  const upgraded = await hre.upgrades.upgradeProxy(proxyAddress, contract, {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  await upgraded.deployed();
  
  const admin = await hre.upgrades.admin.getInstance();
  const implementation = await admin.getProxyImplementation(upgraded.address);

  console.log(`${contractName} upgraded to ${upgraded.address} with implementation contract ${implementation}`);

  return { proxy: upgraded.address, implementation: implementation };
}

module.exports = upgradeContract;