const hre = require("hardhat");

async function deployVLP() {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const vlp = await hre.ethers.deployContract("VLP", [], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  console.log(`VLP deployed to ${vlp.address}`);

  await vlp.deployed();

  return vlp.address;
}

module.exports = deployVLP;