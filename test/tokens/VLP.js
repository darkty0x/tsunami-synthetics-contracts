/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')
const { ethers, upgrades } = require('hardhat')

const { deployContract } = require('../../scripts/utils/helpers.js')
const { zeroAddress, expandDecimals } = require('../../scripts/utils/utilities.js')
const { toChainlinkPrice } = require('../../scripts/utils/chainlink.js')

use(solidity)

describe('VLP', function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vlp
  let operator
  const amount = expandDecimals('1000', 6)

  before(async function () {
    vlp = await deployContract('VLP', [])
    let usdc = await deployContract('BaseToken', ['USD Coin', 'USDC', expandDecimals('10000000', 6)])
    let vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0])
    operator = await deployContract('Operators', [])
    let vestingDuration = 6 * 30 * 24 * 60 * 60
    let vela = await deployContract('MintableBaseToken', ['Vela Exchange', 'VELA', 0])
    let eVela = await deployContract('eVELA', [])
    let tokenFarm = await deployContract('TokenFarm', [
      vestingDuration,
      eVela.address,
      vela.address,
      vlp.address,
      operator.address,
    ])
    let Vault = await deployContract('Vault', [operator.address, vlp.address, vusd.address])
    let priceManager = await deployContract('PriceManager', [operator.address])
    let LiquidateVault = await deployContract('LiquidateVault', [])
    let OrderVault = await deployContract('OrderVault', [])
    let PositionVault = await deployContract('PositionVault', [Vault.address, priceManager.address])
    let usdcPriceFeed = await deployContract('FastPriceFeed', [])
    await usdcPriceFeed.setLatestAnswer(usdc.address, toChainlinkPrice(1))
    await priceManager.setTokenConfig(usdc.address, 6, 100 * 10000, usdcPriceFeed.address, 8)

    let settingsManager = await deployContract('SettingsManager', [
      LiquidateVault.address,
      PositionVault.address,
      operator.address,
      vusd.address,
      tokenFarm.address,
    ])
    await settingsManager.setEnableStaking(usdc.address, true)
    //await settingsManager.setEnableUnstaking(usdc.address, true);
    await vlp.initialize(Vault.address, settingsManager.address)
    await Vault.setVaultSettings(
      priceManager.address,
      settingsManager.address,
      PositionVault.address,
      OrderVault.address,
      LiquidateVault.address
    )
    await vusd.transferOwnership(Vault.address)
    await vlp.transferOwnership(Vault.address)
    operator.setOperator(Vault.address, 1)
    await usdc.connect(wallet).approve(Vault.address, amount)
    await Vault.stake(wallet.address, usdc.address, amount)
  })

  it('id', async () => {
    expect(await vlp.id()).eq('VLP')
  })

    it ("cannot transfer before cooldown", async () => {
        await expect(vlp.transfer(user1.address, amount))
          .to.be.revertedWith("cooldown duration not yet passed");
        await expect(vlp.transferFrom(wallet.address, user1.address, amount))
        .to.be.revertedWith("cooldown duration not yet passed");
    })

    it ("can transfer after cooldown", async () => {
        const passTime = 60 * 60 * 24 * 365
        await ethers.provider.send('evm_increaseTime', [passTime]);
        const halfAmount = expandDecimals('500', 6)
        vlp.transfer(user1.address, amount);
        await vlp.connect(user1).approve(wallet.address,  amount);
        await vlp.transferFrom(user1.address, wallet.address, halfAmount);
    })

});
