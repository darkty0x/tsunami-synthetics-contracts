/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require("chai");
const { solidity } = require("ethereum-waffle")
const { ethers, upgrades } = require("hardhat");

const { deployContract } = require("../../scripts/utils/helpers.js")
const { toUsd, expandDecimals, getBlockTime } = require("../../scripts/utils/utilities.js")
const { toChainlinkPrice } = require("../../scripts/utils/chainlink.js")

use(solidity)

describe("eVELA", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()
    let eVela;

    before(async function () {
        eVela = await deployContract('eVELA', [])
    });

    it ("id", async () => {
        expect(await eVela.id()).eq('esVELA')
    })
});