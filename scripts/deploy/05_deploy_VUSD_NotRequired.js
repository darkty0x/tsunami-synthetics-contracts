const hre = require("hardhat");

async function deployVUSD() {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const vusd = await hre.ethers.deployContract("VUSD", ["Vested USD", "VUSD", 0], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  console.log(`VUSD deployed to ${vusd.address}`);

  await vusd.deployed();

  return vusd.address;
}

module.exports = deployVUSD;