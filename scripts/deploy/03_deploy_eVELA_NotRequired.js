const hre = require("hardhat");

async function deployEVela() {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const eVela = await await hre.ethers.deployContract("eVELA", [], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  console.log(`eVela deployed to ${eVela.address}`);

  await eVela.deployed();

  return eVela.address;
}

module.exports = deployEVela;