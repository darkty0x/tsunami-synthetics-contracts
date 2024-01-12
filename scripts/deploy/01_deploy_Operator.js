const hre = require("hardhat");

async function deployOperators() {
  const { getNamedAccounts } = hre;
  const { deployer, admin, rewardAndFeeManager, normalOperator } = await getNamedAccounts();

  const operators = await hre.ethers.deployContract("Operators", [], {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  await operators.deployed();

  console.log(`Operators deployed to ${operators.address}`);
  console.log(`- Set Operator Level 4 to ${deployer}`);

  await operators.setOperator(admin, 3);
  console.log(`- Set Operator Level 3 to ${admin}`);

  await operators.setOperator(rewardAndFeeManager, 2);
  console.log(`- Set Operator Level 2 to ${rewardAndFeeManager}`);

  await operators.setOperator(normalOperator, 1);
  console.log(`- Set Operator Level 1 to ${normalOperator}`);

  return operators.address;
}

module.exports = deployOperators;