/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require("chai");
const { solidity } = require("ethereum-waffle")
const { ethers, upgrades } = require("hardhat");

const { deployContract } = require("../../scripts/utils/helpers.js")
const { zeroAddress, expandDecimals } = require("../../scripts/utils/utilities.js")
const { toChainlinkPrice } = require("../../scripts/utils/chainlink.js")

use(solidity)

describe("VLP", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()
    let vusd;
    const amount = expandDecimals('1000', 6)

    before(async function () {
        vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0]);
    });

    it ("setInfo", async () => {
        const name = "Vested USDC"
        const symbol =  "VUSDC"
        await vusd.setInfo(name, symbol)
        expect(await vusd.name()).eq(name)
        expect(await vusd.symbol()).eq(symbol)
    })

    it ("balanceOf", async () => {
        const balanceOf = await vusd.balanceOf(user0.address)
        expect(balanceOf).eq(0)
    })

    it ("mint", async () => {
        const amount = expandDecimals('10', 30)
        await expect(vusd.mint(zeroAddress, amount)).to.be.revertedWith("VUSD: mint to the zero address")
    })

    it ("burn", async () => {
        const amount = expandDecimals('10', 30)
        await expect(vusd.burn(zeroAddress, amount)).to.be.revertedWith("VUSD: burn from the zero address")
        await expect(vusd.burn(user0.address, amount)).to.be.revertedWith("VUSD: burn amount exceeds balance")
    })
});
