/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require("chai");
const { solidity } = require("ethereum-waffle")
const { ethers, upgrades } = require("hardhat");

const { deployContract } = require("../../scripts/utils/helpers.js")
const { zeroAddress, expandDecimals } = require("../../scripts/utils/utilities.js")

use(solidity)

describe("MintableBaseToken", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3] = provider.getWallets()
    let btc;

    before(async function () {
        btc = await await deployContract("MintableBaseToken", ["Bitcoin", "BTC", expandDecimals('0', 18)])
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

    it("mint", async () => {
        const amount = expandDecimals('1000', 18)
        await expect(btc.connect(user3).mint(user1.address, amount))
          .to.be.revertedWith('Ownable: caller is not the owner')
        await btc.connect(user1).mint(user1.address, amount)
    }) 

    it("burn", async () => {
        const amount = expandDecimals('1000', 18)
        const bigAmount = expandDecimals('10000', 18)
        await expect(btc.connect(user3).burn(user1.address, amount))
          .to.be.revertedWith('Ownable: caller is not the owner')
        await expect(btc.connect(user1).burn(zeroAddress, amount))
          .to.be.revertedWith('BaseToken: burn from the zero address')
        await expect(btc.connect(user1).burn(user1.address, bigAmount))
          .to.be.revertedWith('BaseToken: burn amount exceeds balance')
        await btc.connect(user1).burn(user1.address, amount)
    }) 
});