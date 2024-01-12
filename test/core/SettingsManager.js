/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')
const { ethers, upgrades } = require('hardhat')

const { deployContract } = require('../../scripts/utils/helpers.js')
const { toUsd, expandDecimals, getBlockTime } = require('../../scripts/utils/utilities.js')
const { toChainlinkPrice } = require('../../scripts/utils/chainlink.js')

use(solidity)

describe('SettingsManager', function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let Vault
  let VaultUtils
  let vusd
  let vlp
  let vela
  let eVela
  let LiquidateVault
  let OrderVault
  let PositionVault
  let priceManager
  let settingsManager
  let tokenFarm
  let vestingDuration
  let btc
  let eth
  let doge
  let gbp
  let eur
  let jpy
  let usdc
  let usdt
  let btcPriceFeed
  let ethPriceFeed
  let dogePriceFeed
  let gbpPriceFeed
  let eurPriceFeed
  let jpyPriceFeed
  let usdcPriceFeed
  let usdtPriceFeed
  let vlpPriceFeed
  let cooldownDuration
  let feeRewardBasisPoints // FeeRewardBasisPoints 70%
  let closeDeltaTime
  let depositFee
  let withdrawFee
  let stakingFee
  let unstakingFee
  let operator
  before(async function () {
    btc = await deployContract('BaseToken', ['Bitcoin', 'BTC', 0])
    btcPriceFeed = await deployContract('FastPriceFeed', [])

    eth = await deployContract('BaseToken', ['Ethereum', 'ETH', 0])
    ethPriceFeed = await deployContract('FastPriceFeed', [])

    doge = await deployContract('BaseToken', ['Dogecoin', 'DOGE', 0])
    dogePriceFeed = await deployContract('FastPriceFeed', [])

    gbp = await deployContract('BaseToken', ['Pound Sterling', 'GBP', 0])
    gbpPriceFeed = await deployContract('FastPriceFeed', [])

    eur = await deployContract('BaseToken', ['Euro', 'EUR', 0])
    eurPriceFeed = await deployContract('FastPriceFeed', [])

    jpy = await deployContract('BaseToken', ['Japanese Yan', 'JPY', 0])
    jpyPriceFeed = await deployContract('FastPriceFeed', [])

    usdt = await deployContract('BaseToken', ['Tether USD', 'USDT', expandDecimals('10000000', 18)])
    usdtPriceFeed = await deployContract('FastPriceFeed', [])
    operator = await deployContract('Operators', [])
    usdc = await deployContract('BaseToken', ['USD Coin', 'USDC', expandDecimals('10000000', 18)])
    usdcPriceFeed = await deployContract('FastPriceFeed', [])
    vlpPriceFeed = await deployContract('FastPriceFeed', [])
    vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0])
    vlp = await deployContract('VLP', [])
    vestingDuration = 6 * 30 * 24 * 60 * 60
    unbondingPeriod = 14 * 24 * 60 * 60
    cooldownDuration = 86400
    liquidationFeeUsd = toUsd(0) // _liquidationFeeUsd
    fundingInterval = 1 * 60 * 60 // fundingInterval = 8 hours
    fundingRateFactor = 100 //  fundingRateFactor
    feeRewardBasisPoints = 70000 // FeeRewardBasisPoints 70%
    closeDeltaTime = 2 * 60 * 60
    depositFee = 3000
    withdrawFee = 3000
    stakingFee = 3000
    unstakingFee = 3000
    vela = await deployContract('MintableBaseToken', ['Vela Exchange', 'VELA', 0])
    eVela = await deployContract('eVELA', [])
    tokenFarm = await deployContract('TokenFarm', [
      vestingDuration,
      eVela.address,
      vela.address,
      vlp.address,
      operator.address,
    ])
    Vault = await deployContract('Vault', [operator.address, vlp.address, vusd.address])
    priceManager = await deployContract('PriceManager', [operator.address])
    LiquidateVault = await deployContract('LiquidateVault', [])
    OrderVault = await deployContract('OrderVault', [])
    PositionVault = await deployContract('PositionVault', [Vault.address, priceManager.address])
    settingsManager = await deployContract('SettingsManager', [
      LiquidateVault.address,
      PositionVault.address,
      operator.address,
      vusd.address,
      tokenFarm.address,
    ])
    VaultUtils = await deployContract('VaultUtils', [
      LiquidateVault.address,
      OrderVault.address,
      PositionVault.address,
      priceManager.address,
      settingsManager.address,
    ])
    await PositionVault.initialize(
      OrderVault.address,
      LiquidateVault.address,
      settingsManager.address,
      VaultUtils.address
    )
    await OrderVault.initialize(
      priceManager.address,
      PositionVault.address,
      settingsManager.address,
      Vault.address,
      VaultUtils.address
    )
    await LiquidateVault.initialize(PositionVault.address, settingsManager.address, Vault.address, VaultUtils.address)
  })

  it('setVaultSettings', async () => {
    const max_cooldown_duration = 49 * 24 * 60 * 60
    const minFeeBasisPoints = 40000
    const maxFeeBasisPoints = 110000
    await expect(settingsManager.setVaultSettings(max_cooldown_duration, feeRewardBasisPoints)).to.be.revertedWith(
      'invalid cooldownDuration'
    )
    await expect(settingsManager.setVaultSettings(cooldownDuration, maxFeeBasisPoints)).to.be.revertedWith('Above max')
    await settingsManager.setVaultSettings(cooldownDuration, feeRewardBasisPoints)
  })

  it('setCloseDeltaTime', async () => {
    const maxCloseDeltaTime = 25 * 60 * 60
    await expect(settingsManager.setCloseDeltaTime(maxCloseDeltaTime)).to.be.revertedWith('Above max')
    await settingsManager.setCloseDeltaTime(closeDeltaTime)
  })

  it('setDepositFee', async () => {
    await expect(settingsManager.setDepositFee(btc.address, 15000)).to.be.revertedWith('Above max')
    await settingsManager.setDepositFee(btc.address, depositFee)
  })

  it('setWithdrawFee', async () => {
    await expect(settingsManager.setWithdrawFee(btc.address, 15000)).to.be.revertedWith('Above max')
    await settingsManager.setWithdrawFee(btc.address, withdrawFee)
  })

  it('setEnableDeposit', async () => {
    const token = usdt.address
    await settingsManager.setEnableDeposit(token, true)
  })

  it('setEnableStaking', async () => {
    const token = usdt.address
    await settingsManager.setEnableStaking(token, true)
  })

  /*it ("setEnableUnstaking", async () => {
      const token = usdt.address
      await settingsManager.setEnableUnstaking(token, true)
    })*/ // no disable unstaking

  it('setLiquidateThreshold', async () => {
    const newThreshold = 2000
    const token = btc.address
    const maxThreshold = 1200000
    await expect(settingsManager.setLiquidateThreshold(maxThreshold, token)).to.be.revertedWith('Above max')
    await settingsManager.setLiquidateThreshold(newThreshold, token)
  })

  it('setLiquidationFeeUsd', async () => {
    const liquidationFeeUsd = expandDecimals('2', 30)
    const maxLiquidationFeeUsd = expandDecimals('120', 30)
    await expect(settingsManager.setLiquidationFeeUsd(maxLiquidationFeeUsd)).to.be.revertedWith('Above max')
    await settingsManager.setLiquidationFeeUsd(liquidationFeeUsd)
  })

  it('setMarginFeeBasisPoints', async () => {
    const btcMarginFeeBasisPoints = 80
    const ethMarginFeeBasisPoints = 80
    const dogeMarginFeeBasisPoints = 80
    const gbpMarginFeeBasisPoints = 8
    const eurMarginFeeBasisPoints = 8
    const jpyMarginFeeBasisPoints = 8
    await expect(settingsManager.setMarginFeeBasisPoints(btc.address, true, 5500)).to.be.revertedWith('Above max')
    await settingsManager.setMarginFeeBasisPoints(btc.address, true, btcMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(btc.address, false, btcMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eth.address, true, ethMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eth.address, false, ethMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(doge.address, true, dogeMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(doge.address, false, dogeMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(gbp.address, true, gbpMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(gbp.address, false, gbpMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eur.address, true, eurMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eur.address, false, eurMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(jpy.address, true, jpyMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(jpy.address, false, jpyMarginFeeBasisPoints)
  })

  it('validatePosition', async () => {
    const _account = wallet.address
    const _indexToken = btc.address
    const _isLong = true
    const _size = 0
    const _collateral = 0
    await expect(settingsManager.validatePosition(_account, _indexToken, _isLong, 0, 10)).to.be.revertedWith(
      'collateral zero'
    )
    await expect(settingsManager.validatePosition(_account, _indexToken, _isLong, 10, 100)).to.be.revertedWith(
      'pos size > collateral'
    )
    await settingsManager.validatePosition(_account, _indexToken, _isLong, _size, _collateral)
    await settingsManager.setMaxOpenInterestPerAssetPerSide(_indexToken, _isLong, 10)
    await settingsManager.setMaxOpenInterestPerUser(10)
    await expect(settingsManager.validatePosition(_account, _indexToken, _isLong, 100, 10)).to.be.revertedWith(
      'maxOI exceeded'
    )
    await settingsManager.setMaxOpenInterestPerAssetPerSide(_indexToken, _isLong, 100)
    await settingsManager.setMaxOpenInterestPerWallet(_account, 1)
    await expect(settingsManager.validatePosition(_account, _indexToken, _isLong, 100, 10)).to.be.revertedWith(
      'maxOI exceeded'
    )
    await settingsManager.setMaxOpenInterestPerWallet(_account, 1000000)
    await settingsManager.setMaxOpenInterestPerAsset(_indexToken, 100)
    await expect(settingsManager.validatePosition(_account, _indexToken, _isLong, 100, 10)).to.be.revertedWith(
      'maxOI exceeded'
    )
    await settingsManager.setMaxOpenInterestPerUser(100)
    await settingsManager.validatePosition(_account, _indexToken, _isLong, 100, 50)
    await settingsManager.setMaxOpenInterestPerAssetPerSide(_indexToken, _isLong, 10)
    await expect(settingsManager.validatePosition(_account, _indexToken, _isLong, 100, 10)).to.be.revertedWith(
      'maxOI exceeded'
    )
    settingsManager.validatePosition(
      // should not revert for the other side
      _account,
      _indexToken,
      !_isLong,
      100,
      10
    )
    await settingsManager.setMaxOpenInterestPerAssetPerSide(_indexToken, _isLong, 100)
  })

  it('setStakingFee', async () => {
    const fee = 100
    await expect(settingsManager.setStakingFee(btc.address, 150000)).to.be.revertedWith('Above max')
    await settingsManager.setStakingFee(btc.address, fee)
  })

  it('setReferEnabled', async () => {
    const referEnabled = true
    await settingsManager.setReferEnabled(referEnabled)
  })

  it('setReferFee', async () => {
    const fee1 = 10000000 // greater than feeDivisor
    await expect(settingsManager.setReferFee(fee1)).to.be.revertedWith('Above max')
    const fee2 = 100 // greater than feeDivisor
    await settingsManager.setReferFee(fee2)
  })

  it('setPriceMovementPercent', async () => {
    const priceMovementPercent = 10000000 // greater than feeDivisor
    await expect(settingsManager.setPriceMovementPercent(priceMovementPercent)).to.be.revertedWith('Above max')
    const priceMovementPercent2 = 100 // greater than feeDivisor
    await settingsManager.setPriceMovementPercent(priceMovementPercent2)
  })

  it('setFeeManager', async () => {
    await expect(settingsManager.connect(user2).setFeeManager(user0.address)).to.be.revertedWith('invalid operator')
    await settingsManager.setFeeManager(user0.address)
  })

  it('setBountyPercent', async () => {
    await expect(settingsManager.connect(user2).setBountyPercent(25000, 25000, 25000)).to.be.revertedWith(
      'invalid operator'
    )
    await expect(settingsManager.setBountyPercent(50000, 50000, 1000)).to.be.revertedWith('invalid bountyPercent')
    await settingsManager.setBountyPercent(25000, 25000, 25000)
  })

  /*it ("enableMarketOrder", async () => {
      await expect(settingsManager.connect(user2).enableMarketOrder(true))
        .to.be.revertedWith("invalid operator")
      await settingsManager.enableMarketOrder(true)
    })*/ //todo: discuss enableMarketOrder removal

  it('getFundingFee', async () => {
    const _indexToken = btc.address
    const _isLong = true
    const _size = 1000
    const _entryFundingRate = 0
    const fundingFee = await settingsManager.getFundingFee(_indexToken, _isLong, _size, _entryFundingRate)
  })

  it('getPositionFee', async () => {
    const _indexToken = btc.address
    const _isLong = true
    const _sizeDelta = 10000
    expect(await settingsManager.getPositionFee(_indexToken, _isLong, 0)).eq(0)
    expect(await settingsManager.getPositionFee(_indexToken, _isLong, _sizeDelta)).eq(8)
  })

  it('delegate', async () => {
    await settingsManager.delegate([user0.address, user1.address])
    const allDelegates = await settingsManager.getDelegates(wallet.address)
  })

  it('checkDelegation', async () => {
    expect(await settingsManager.checkDelegation(wallet.address, wallet.address)).eq(true)
    expect(await settingsManager.checkDelegation(wallet.address, user1.address)).eq(true)
  })

  it('checkDelegation after undelegate', async () => {
    await settingsManager.undelegate([user1.address])
    expect(await settingsManager.checkDelegation(wallet.address, user1.address)).eq(false)
  })

  it('check onlyVault', async () => {
    const token = btc.address
    const sender = wallet.address
    const isLong = true
    const amount = expandDecimals('10', 30)
    await expect(settingsManager.decreaseOpenInterest(token, sender, isLong, amount)).to.be.revertedWith('Only vault')
  })
})
