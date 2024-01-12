const { BigNumberish, formatFixed } = require("@ethersproject/bignumber");
const { ethers } = require("hardhat");
const maxUint256 = ethers.constants.MaxUint256;
const zeroAddress = ethers.constants.AddressZero;
function newWallet() {
  return ethers.Wallet.createRandom();
}

function bigNumberify(n) {
  return ethers.BigNumber.from(n);
}

function parseBytes32FromString(text) {
  return ethers.utils.formatBytes32String(text);
}

function expandDecimals(n, decimals) {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals));
}

async function send(provider, method, params = []) {
  await provider.send(method, params);
}

async function mineBlock(provider) {
  await send(provider, "evm_mine");
}

async function increaseTime(provider, seconds) {
  await send(provider, "evm_increaseTime", [seconds]);
}

function toUsd(value) {
  const normalizedValue = parseInt(value * Math.pow(10, 10));
  return ethers.BigNumber.from(normalizedValue).mul(
    ethers.BigNumber.from(10).pow(20)
  );
}

async function gasUsed(provider, tx) {
  return (await provider.getTransactionReceipt(tx.hash)).gasUsed;
}

async function getNetworkFee(provider, tx) {
  const gas = await gasUsed(provider, tx);
  return gas.mul(tx.gasPrice);
}

async function reportGasUsed(provider, tx, label) {
  const { gasUsed } = await provider.getTransactionReceipt(tx.hash);
  console.info(label, gasUsed.toString());
}

async function getBlockTime(provider) {
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  return block.timestamp;
}

async function getTxnBalances(provider, user, txn, callback) {
  const balance0 = await provider.getBalance(user.address);
  const tx = await txn();
  const fee = await getNetworkFee(provider, tx);
  const balance1 = await provider.getBalance(user.address);
  callback(balance0, balance1, fee);
}

function fromUtf8(txt) {
  return ethers.utils.formatBytes32String(txt);
}

function parseUnits(txt, decimals) {
  return ethers.utils.parseUnits(txt, decimals);
}

function formatUnits(value, unitName) {
  if (typeof unitName === "string") {
    const index = names.indexOf(unitName);
    if (index !== -1) {
      unitName = 3 * index;
    }
  }
  return formatFixed(value, unitName != null ? unitName : 18);
}

module.exports = {
  newWallet,
  maxUint256,
  zeroAddress,
  fromUtf8,
  parseUnits,
  toUsd,
  formatUnits,
  expandDecimals,
  mineBlock,
  increaseTime,
  gasUsed,
  bigNumberify,
  parseBytes32FromString,
  getNetworkFee,
  reportGasUsed,
  getBlockTime,
  getTxnBalances,
};
