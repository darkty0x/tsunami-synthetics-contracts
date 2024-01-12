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

describe("VELA", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()
    let vela;

    before(async function () {
        const trustedForwarder = user3.address
        vela = await deployContract('Vela', [trustedForwarder])
    });

    it ("maxSupply", async () => {
        const maxSupply = await vela.maxSupply()
        const decimals = await vela.decimals()
        expect(decimals).eq(18)
        expect(ethers.utils.formatUnits(maxSupply, decimals)).eq('100000000.0')
    })

    it ("isTrustedForwarder", async () => {
        expect(await vela.isTrustedForwarder(user1.address)).eq(false)
        expect(await vela.isTrustedForwarder(user3.address)).eq(true)
    })

    it("mint", async () => {
       const mintAmount = expandDecimals('1000', 18)  
       await vela.mint(user0.address, mintAmount)
       expect(await vela.totalSupply()).eq(expandDecimals('1000', 18))
       expect(await vela.balanceOf(user0.address)).eq(expandDecimals('1000', 18))
       const amoutAboveMaxSupply = expandDecimals('150000000', 18)
       await expect(vela.mint(user0.address, amoutAboveMaxSupply))
       .to.be.revertedWith("ERC20: cannot mint more tokens, cap exceeded")
    })

    it ("enableMetaTxns", async () => {
        await vela.enableMetaTxns()
        await vela.disableMetaTxns()
    })

    it ("pause", async () => {
        await vela.pause()
        await vela.unpause()
    })

    it ("rescueTokens", async () => {
        const mintAmount = expandDecimals('1000', 18)  
        await vela.mint(vela.address, mintAmount)
        const amount = expandDecimals('100', 18)
        await vela.rescueTokens(vela.address, amount)
    })
});