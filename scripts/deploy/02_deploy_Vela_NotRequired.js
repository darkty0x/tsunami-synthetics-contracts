const hre = require("hardhat");

async function deployVela() {
  const { getNamedAccounts } = hre;
  const { deployer, trustedForwarder } = await getNamedAccounts();

  const vela = await hre.ethers.deployContract("Vela", [trustedForwarder], {
    from: deployer,
    log: true,
    waitConfirmations: 1
  });

  console.log(`Vela deployed to ${vela.address}`);

  await vela.deployed();

  return vela.address;
}

module.exports = deployVela;