/**
 *
 * Common utility functions
 *
 */

const fs = require("fs");
const neatCsv = require("neat-csv");

const { ethers } = require("ethers");

const assetMap = { 0: "NATIVE", 1: "ERC20 ", 2: "NONE  " };

module.exports = {
  fromUtf8: function (txt) {
    return ethers.utils.formatBytes32String(txt);
  },

  toUtf8: function (txt) {
    return ethers.utils.parseBytes32String(txt);
  },

  fromWei: function (wei) {
    return ethers.utils.formatEther(wei);
  },

  toWei: function (wei) {
    return ethers.utils.parseEther(wei);
  },

  formatUnits: function (bn, decimals) {
    return ethers.utils.formatUnits(bn, decimals);
  },

  parseUnits: function (txt, decimals) {
    return ethers.utils.parseUnits(txt, decimals);
  },

  bnToStr: function (_bn) {
    return _bn.toString();
  },

  printResults: function (account, name, res, decimals) {
    let assetTypeInt = parseInt(res.assetType.toString());
    console.log(
      "Account: ",
      account,
      ":::",
      name,
      "::",
      assetMap[assetTypeInt],
      "::",
      ethers.utils.formatUnits(res.available, decimals),
      "/",
      ethers.utils.formatUnits(res.total, decimals),
      "/",
      "[P Avail / P Tot]"
    );
  },

  printBalances: function (_account, _res, decimals) {
    let assetTypeInt = parseInt(_res.assetType.toString());
    console.log(
      "Account: ",
      _account,
      " ::: ",
      assetMap[assetTypeInt],
      " :: ",
      ethers.utils.formatUnits(_res.available, decimals),
      "/",
      ethers.utils.formatUnits(_res.total, decimals),
      "/",
      "[P Avail / P Tot]"
    );
  },

  loadOrders: async function (filename) {
    let rawdata = fs.readFileSync(filename);
    const result = await neatCsv(rawdata);
    return result;
  },

  getMapKeyByValue: function (map, searchValue) {
    for (let [key, value] of map.entries()) {
      if (value.id === searchValue) return key;
    }
  },
};
