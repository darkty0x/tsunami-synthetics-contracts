const hre = require("hardhat");

async function deployTokenFarm(eVelaAddress, velaAddress, vlpAddress, operatorsAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  
  const TokenFarm = await hre.ethers.getContractFactory("TokenFarm");

  const tokenFarm = await hre.upgrades.deployProxy(TokenFarm, [
    31536000,
    eVelaAddress,
    velaAddress,
    vlpAddress,
    operatorsAddress,
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await tokenFarm.deployed();

  console.log(`TokenFarm deployed to ${tokenFarm.address}`);

  // TODO
  // Set VELA Pool
  // Set VLP Pool

  return tokenFarm.address;
}

module.exports = deployTokenFarm;