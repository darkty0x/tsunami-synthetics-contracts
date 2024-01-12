/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require("chai");
const { solidity } = require("ethereum-waffle")
const { ethers, upgrades } = require("hardhat");

const { deployContract } = require("../../scripts/utils/helpers.js")
const { zeroAddress, expandDecimals } = require("../../scripts/utils/utilities.js")

use(solidity)

describe("BaseToken", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()
    let btc;

    before(async function () {
        btc = await await deployContract("BaseToken", ["Bitcoin", "BTC", expandDecimals('10000000', 18)])
    });

    it("transferOwnership", async () => {
        await expect(btc.connect(user0).transferOwnership(user1.address))
          .to.be.revertedWith("Ownable: caller is not the owner")
    
        expect(await btc.owner()).eq(wallet.address)
    
        await expect(btc.connect(wallet).transferOwnership(zeroAddress))
          .to.be.revertedWith("Ownable: new owner is the zero address")
  
        await btc.transferOwnership(user0.address)
        expect(await btc.owner()).eq(user0.address)
    
        await btc.connect(user0).transferOwnership(user1.address)
        expect(await btc.owner()).eq(user1.address)
    })

    it("setInfo", async () => {
        const name = "Bitcoin 2"
        const symbol = "BTC2"
        await expect(btc.connect(user3).setInfo(name, symbol))
        .to.be.revertedWith('Ownable: caller is not the owner')
        await btc.connect(user1).setInfo(name, symbol)
        expect(await btc.name()).eq(name)
        expect(await btc.symbol()).eq(symbol)
    })

    it("transfer", async () => {
        const amount = expandDecimals('1000', 18)
        await expect(btc.connect(wallet).transfer(zeroAddress, amount))
            .to.be.revertedWith('BaseToken: transfer to the zero address')
        await expect(btc.connect(user3).transfer(wallet.address, amount))
            .to.be.revertedWith('BaseToken: transfer amount exceeds balance')
        await btc.connect(wallet).transfer(user1.address, amount)
        expect(await btc.balanceOf(user1.address)).eq(amount)
    })     

    it("approve", async () => {
        const amount = expandDecimals('1000', 18)
        await expect(btc.connect(wallet).approve(zeroAddress, amount))
            .to.be.revertedWith('BaseToken: approve to the zero address')
        await btc.connect(wallet).approve(user2.address, amount)
        expect(await btc.allowance(wallet.address, user2.address)).eq(amount)
    })  

    it("transferFrom", async () => {
        const amount = expandDecimals('1000', 18)
        await expect(btc.connect(user2).transferFrom(zeroAddress, user2.address, amount))
        .to.be.revertedWith('BaseToken: transfer amount exceeds allowance')
        await expect(btc.connect(user2).transferFrom(user1.address, user2.address, amount))
            .to.be.revertedWith('BaseToken: transfer amount exceeds allowance')
        await btc.connect(user2).transferFrom(wallet.address, user2.address, amount)
        expect(await btc.allowance(wallet.address, user3.address)).eq(0)
    })
});