const hre = require("hardhat");

// TODO
// const ASSETS = [
//   {
//     1, 'BTC/USD', '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', '28776900000000000000000000000000000', 10, 1000, 1000000
//   },
//   ...
// ];

async function deployPriceManager(operatorsAddress) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const PriceManager = await hre.ethers.getContractFactory("PriceManager");

  // const pythAddress = "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C";
  // const MockPyth = await hre.ethers.getContractFactory("MockPyth");

  const mockPyth = await hre.ethers.deployContract("MockPyth", [], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  await mockPyth.deployed();

  const priceManager = await hre.upgrades.deployProxy(PriceManager, [
    operatorsAddress,
    mockPyth.address, // pythAddress
  ], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
    initializer: 'initialize',
  });

  await priceManager.deployed();

  console.log(`PriceManager deployed to ${priceManager.address}`);

  console.log(`- Pyth: ${mockPyth.address}`);

  await priceManager.setAsset(1, 'BTC/USD', '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', '28776900000000000000000000000000000', 10, 1000, 1000000);
  console.log(`- Set Asset: BTC/USD`);
  
  await priceManager.setAsset(2, 'ETH/USD', '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', '1880520000000000000000000000000000', 10, 1000, 1000000);
  console.log(`- Set Asset: ETH/USD`);
  
  await priceManager.setAsset(3, 'LTC/USD', '0x6e3f3fa8253588df9326580180233eb791e03b443a3ba7a1d892e73874e19a54', '87790000000000000000000000000000', 10, 1000, 1000000);
  console.log(`- Set Asset: LTC/USD`);
  
  await priceManager.setAsset(4, 'ADA/USD', '0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d', '390000000000000000000000000000', 10, 1000, 1000000);
  console.log(`- Set Asset: ADA/USD`);
  
  // TODO (add more assets)

  return priceManager.address;
}

module.exports = deployPriceManager;