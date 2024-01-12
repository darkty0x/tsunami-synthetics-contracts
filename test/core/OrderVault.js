/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')
const { ethers, upgrades } = require('hardhat')

const { deployContract } = require('../../scripts/utils/helpers.js')
const { toUsd, expandDecimals, getBlockTime, zeroAddress } = require('../../scripts/utils/utilities.js')
const { toChainlinkPrice } = require('../../scripts/utils/chainlink.js')

use(solidity)

describe('OrderVault', function () {
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
  let positionManagerAddress
  let priceManager
  let settingsManager
  let tokenFarm
  let operator
  let vestingDuration
  let btc
  let eth
  let doge
  let gbp
  let eur
  let jpy
  let usdc
  let usdt
  let priceFeed
  let cooldownDuration

  async function expectMarketOrderSuccess(token, price) {
    expect(await PositionVault.getNumOfUnexecutedMarketOrders()).eq(1)
    const now = await priceManager.getCurrentTime()
    await priceManager.setPrice(token.address, now, toChainlinkPrice(price))
    const tx = await PositionVault.connect(user1).executeOpenMarketOrders(1)
    const receipt = await tx.wait()
    const errorEvent = receipt.events.find((event) => event.event === 'MarketOrderExecutionError')
    expect(errorEvent).to.be.undefined
  }

  before(async function () {
    positionManagerAddress = user1.address
    priceFeed = await deployContract('FastPriceFeed', [])
    btc = await deployContract('BaseToken', ['Bitcoin', 'BTC', 0])
    eth = await deployContract('BaseToken', ['Ethereum', 'ETH', 0])
    doge = await deployContract('BaseToken', ['Dogecoin', 'DOGE', 0])
    gbp = await deployContract('BaseToken', ['Pound Sterling', 'GBP', 0])
    eur = await deployContract('BaseToken', ['Euro', 'EUR', 0])
    jpy = await deployContract('BaseToken', ['Japanese Yan', 'JPY', 0])
    usdt = await deployContract('BaseToken', ['Tether USD', 'USDT', expandDecimals('10000000', 18)])
    usdc = await deployContract('BaseToken', ['USD Coin', 'USDC', expandDecimals('10000000', 18)])
    vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0])
    vlp = await deployContract('VLP', [])
    operator = await deployContract('Operators', [])
    vestingDuration = 6 * 30 * 24 * 60 * 60
    unbondingPeriod = 14 * 24 * 60 * 60
    cooldownDuration = 86400
    liquidationFeeUsd = toUsd(0) // _liquidationFeeUsd
    fundingInterval = 1 * 60 * 60 // fundingInterval = 8 hours
    fundingRateFactor = 100 //  fundingRateFactor
    feeRewardBasisPoints = 70000 // FeeRewardBasisPoints 70%
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
    priceManager = await deployContract('PriceManager', [operator.address])
    Vault = await deployContract('Vault', [operator.address, vlp.address, vusd.address])
    LiquidateVault = await deployContract('LiquidateVault', [])
    OrderVault = await deployContract('OrderVault', [])
    PositionVault = await deployContract('PositionVault', [Vault.address, priceManager.address])
    operator.setOperator(PositionVault.address, 1)
    operator.setOperator(Vault.address, 1)
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
    //====================== Vault Initialize ==============
    await Vault.setVaultSettings(
      priceManager.address,
      settingsManager.address,
      PositionVault.address,
      OrderVault.address,
      LiquidateVault.address
    )
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
    //================= PriceFeed Prices Initialization ==================
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice(60000))
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice(56300))
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice(57000))
    await priceFeed.setLatestAnswer(eth.address, toChainlinkPrice(4000))
    await priceFeed.setLatestAnswer(eth.address, toChainlinkPrice(3920))
    await priceFeed.setLatestAnswer(eth.address, toChainlinkPrice(4180))
    await priceFeed.setLatestAnswer(doge.address, toChainlinkPrice(5))
    await priceFeed.setLatestAnswer(gbp.address, toChainlinkPrice(15))
    await priceFeed.setLatestAnswer(eur.address, toChainlinkPrice(1))
    await priceFeed.setLatestAnswer(jpy.address, '1600000') // 0.016
    await priceFeed.setLatestAnswer(usdt.address, toChainlinkPrice(1))
    await priceFeed.setLatestAnswer(usdc.address, toChainlinkPrice(1))
    await priceFeed.setAdmin(priceManager.address, true)
    const tokens = [
      {
        name: 'btc',
        address: btc.address,
        decimals: 18,
        isForex: false,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 30 * 10000,
        marginFeeBasisPoints: 80, // 0.08% 80 / 100000
      },
      {
        name: 'eth',
        address: eth.address,
        decimals: 18,
        isForex: false,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 30 * 10000,
        marginFeeBasisPoints: 80, // 0.08% 80 / 100000
      },
      {
        name: 'doge',
        address: doge.address,
        decimals: 18,
        isForex: false,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 30 * 10000,
        marginFeeBasisPoints: 80, // 0.08% 80 / 100000
      },
      {
        name: 'gbp',
        address: gbp.address,
        decimals: 18,
        isForex: true,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 100 * 10000,
        marginFeeBasisPoints: 8, // 0.008% 80 / 100000
      },
      {
        name: 'eur',
        address: eur.address,
        decimals: 18,
        isForex: true,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 100 * 10000,
        marginFeeBasisPoints: 8, // 0.008% 80 / 100000
      },
      {
        name: 'jpy',
        address: jpy.address,
        decimals: 18,
        isForex: true,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 100 * 10000,
        marginFeeBasisPoints: 8, // 0.008% 80 / 100000
      },
      {
        name: 'usdc',
        address: usdc.address,
        decimals: 18,
        isForex: true,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 100 * 10000,
        marginFeeBasisPoints: 80, // 0.08% 80 / 100000
      },
      {
        name: 'usdt',
        address: usdt.address,
        decimals: 18,
        isForex: true,
        priceFeed: priceFeed.address,
        priceDecimals: 8,
        maxLeverage: 100 * 10000,
        marginFeeBasisPoints: 80, // 0.08% 80 / 100000
      },
    ]
    for (const token of tokens) {
      await priceManager.setTokenConfig(
        token.address,
        token.decimals,
        token.maxLeverage,
        token.priceFeed,
        token.priceDecimals
      )
    }
    await vlp.transferOwnership(Vault.address) // transferOwnership
    await settingsManager.setPositionManager(positionManagerAddress, true)
    // await VaultUtils.setDepositFee(depositFee);
    // await VaultUtils.setStakingFee(stakingFee);
  })

  it('approve Stable Coins for Vault ', async () => {
    await usdt.connect(wallet).approve(Vault.address, expandDecimals('10000000', 18)) // approve USDT
    await usdc.connect(wallet).approve(Vault.address, expandDecimals('10000000', 18)) // approve USDC
  })

  it('add Vault as admin', async () => {
    await vusd.transferOwnership(Vault.address) // addAdmin vault
  })

  it('set LiquidateThreshod for VaultUtils', async () => {
    const BTCLiquidateThreshold = 990000
    const BTCMaxOpenInterest = expandDecimals('10000000000', 30)
    const BTCLongFundingRateFactor = 100
    const BTCShortFundingRateFactor = 100
    const BTCLongMarginFeeBasisPoints = 80
    const BTCShortMarginFeeBasisPoints = 80
    const ETHLiquidateThreshold = 990000
    const ETHMaxOpenInterest = expandDecimals('10000000000', 30)
    const ETHLongFundingRateFactor = 100
    const ETHShortFundingRateFactor = 100
    const ETHLongMarginFeeBasisPoints = 80
    const ETHShortMarginFeeBasisPoints = 80
    const GBPLiquidateThreshold = 997000
    const GBPMaxOpenInterest = expandDecimals('10000000000', 30)
    const GBPLongFundingRateFactor = 100
    const GBPShortFundingRateFactor = 100
    const GBPLongMarginFeeBasisPoints = 8
    const GBPShortMarginFeeBasisPoints = 8
    const EURLiquidateThreshold = 997000
    const EURMaxOpenInterest = expandDecimals('10000000000', 30)
    const EURLongFundingRateFactor = 100
    const EURShortFundingRateFactor = 100
    const EURLongMarginFeeBasisPoints = 8
    const EURShortMarginFeeBasisPoints = 8
    const JPYLiquidateThreshold = 997000
    const JPYMaxOpenInterest = expandDecimals('10000000000', 30)
    const JPYLongFundingRateFactor = 100
    const JPYShortFundingRateFactor = 100
    const JPYLongMarginFeeBasisPoints = 8
    const JPYShortMarginFeeBasisPoints = 8
    const DOGELiquidateThreshold = 990000
    const DOGEMaxOpenInterest = expandDecimals('10000000000', 30)
    const DOGELongFundingRateFactor = 100
    const DOGEShortFundingRateFactor = 100
    const DOGELongMarginFeeBasisPoints = 80
    const DOGEShortMarginFeeBasisPoints = 80
    const LONGMaxOpenInterest = expandDecimals('1000000000000', 30)
    const SHORTMaxOpenInterest = expandDecimals('1000000000000', 30)
    const USERMaxOpenInterest = expandDecimals('10000000000', 30)
    await settingsManager.setLiquidateThreshold(BTCLiquidateThreshold, btc.address)
    await settingsManager.setMaxOpenInterestPerAsset(btc.address, BTCMaxOpenInterest)
    await settingsManager.setFundingRateFactor(btc.address, BTCLongFundingRateFactor)
    await settingsManager.setMarginFeeBasisPoints(btc.address, true, BTCLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(btc.address, false, BTCShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(ETHLiquidateThreshold, eth.address)
    await settingsManager.setMaxOpenInterestPerAsset(eth.address, ETHMaxOpenInterest)
    await settingsManager.setFundingRateFactor(eth.address, ETHLongFundingRateFactor)
    await settingsManager.setMarginFeeBasisPoints(eth.address, true, ETHLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eth.address, false, ETHShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(DOGELiquidateThreshold, doge.address)
    await settingsManager.setMaxOpenInterestPerAsset(doge.address, DOGEMaxOpenInterest)
    await settingsManager.setFundingRateFactor(doge.address, DOGELongFundingRateFactor)
    await settingsManager.setMarginFeeBasisPoints(doge.address, true, DOGELongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(doge.address, false, DOGEShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(GBPLiquidateThreshold, gbp.address)
    await settingsManager.setMaxOpenInterestPerAsset(gbp.address, GBPMaxOpenInterest)
    await settingsManager.setFundingRateFactor(gbp.address, GBPLongFundingRateFactor)
    await settingsManager.setMarginFeeBasisPoints(gbp.address, true, GBPLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(gbp.address, false, GBPShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(EURLiquidateThreshold, eur.address)
    await settingsManager.setMaxOpenInterestPerAsset(eur.address, EURMaxOpenInterest)
    await settingsManager.setFundingRateFactor(eur.address, EURLongFundingRateFactor)
    await settingsManager.setMarginFeeBasisPoints(eur.address, true, EURLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eur.address, false, EURShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(JPYLiquidateThreshold, jpy.address)
    await settingsManager.setFundingRateFactor(jpy.address, JPYLongFundingRateFactor)
    await settingsManager.setMarginFeeBasisPoints(jpy.address, true, JPYLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(jpy.address, false, JPYShortMarginFeeBasisPoints)
    await settingsManager.setMaxOpenInterestPerUser(USERMaxOpenInterest)
    await settingsManager.setEnableDeposit(usdt.address, true)
    await settingsManager.setEnableStaking(usdt.address, true)
    // await settingsManager.setEnableUnstaking(usdt.address, true)
    await settingsManager.setEnableDeposit(usdc.address, true)
    await settingsManager.setEnableStaking(usdc.address, true)
    // await settingsManager.setEnableUnstaking(usdc.address, true)
  })

  // it('Stake Stable Coins for Vault ', async () => {
  //   const amount = expandDecimals('100000', 18)
  //   const vlpBalanceBeforeStake = await vlp.balanceOf(wallet.address)
  //   const usdtBalanceBeforeStake = await usdt.balanceOf(wallet.address)
  //   expect(parseFloat(ethers.utils.formatUnits(vlpBalanceBeforeStake, 18))).eq(0)
  //   expect(parseFloat(ethers.utils.formatUnits(usdtBalanceBeforeStake, 18))).eq(10000000.0)
  //   await Vault.stake(wallet.address, usdt.address, amount)
  //   const vlpBalanceAfterStake = await vlp.balanceOf(wallet.address)
  //   const usdtBalanceAfterStake = await usdt.balanceOf(wallet.address)
  //   //  expect(parseFloat(ethers.utils.formatUnits(vlpBalanceAfterStake, 18))).eq(6062.5)
  //   // liquidity fee = 0.3%
  //   // amountAfterFee = 100000 * 99.7% = 99700 USDT (1USDT = 1usd)
  //   // VLP Price = 16usd
  //   // so vlpAmount = 99700 / 16 = 6,231.25
  //   expect(parseFloat(ethers.utils.formatUnits(usdtBalanceAfterStake, 18))).eq(9900000.0)
  //   // usdAmount = 10000000 - 100000 = 9900000.0
  // })

  it('deposit Stable Coins for Vault ', async () => {
    // await usdt.connect(wallet).approve(Vault.address, expandDecimals('100000', 18)) // approve USDT
    await usdc.connect(wallet).approve(Vault.address, expandDecimals('100000', 18)) // approve USDC
    //  await Vault.deposit(wallet.address, usdt.address, expandDecimals('100000', 18)); // deposit USDT
    await Vault.deposit(wallet.address, usdc.address, expandDecimals('100000', 18)) // deposit USDC
  })

  it('vlpBalance', async () => {
    const vlpBalanceOf = await vlp.balanceOf(wallet.address)
  })

  // note: this test is completely duplicated from another test in this file
  //    but it is needed for the other tests to not fail
  it('increasePosition for TakeProfit', async () => {
    const indexToken = btc.address
    const amountIn = expandDecimals('100', 30)
    const toUsdAmount = expandDecimals('1000', 30)
    const isLong = true
    const takeProfit = '0.0'
    const stopLoss = '0.0'
    const positionType = 0
    const referAddress = ethers.constants.AddressZero
    const orderType = 0 // M
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
    const passTime = 60 * 60 * 24
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('setLatestAnswer for BTC', async () => {
    const lastBtcPrice = await priceManager.getLastPrice(btc.address)
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('57002'))
  })

  it('addTriggerOrders 1', async () => {
    const indexToken = btc.address
    const isLong = true
    const posId = 0
    const isTPs = [true, false]
    const prices = [expandDecimals('57500', 30), expandDecimals('54000', 30)]
    const amountPercents = [50000, 100000]
    const newTriggerGasFee = expandDecimals('1', 16)
    await expect(settingsManager.setTriggerGasFee(expandDecimals('1', 18))).to.be.revertedWith('Above max')
    await settingsManager.setTriggerGasFee(newTriggerGasFee)
    await expect(
      OrderVault.addTriggerOrders(indexToken, isLong, posId, isTPs, prices, amountPercents, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('invalid triggerGasFee')
    await OrderVault.addTriggerOrders(indexToken, isLong, posId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: newTriggerGasFee,
    })
    await settingsManager.setTriggerGasFee(0)
  })

  it('getTriggerOrderInfo', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 0
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(posId)
    console.log('triggerOrderInfo: ', triggerOrderInfo.status.toString())
    const triggers = triggerOrderInfo.triggers
    for (let i = 0; i < triggers.length; i++) {
      console.log(
        'i : ',
        i,
        triggers[i].isTP,
        triggers[i].price.toString(),
        triggers[i].createdAt.toString(),
        triggers[i].status.toString()
      )
    }
  })

  it('set PositionManager', async () => {
    await settingsManager.setPositionManager(wallet.address, true)
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('58000'))
  })

  it('triggerPosition 1', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    // const posId = 0
    // await expect(PositionVault.triggerForTPSL(posId)).to.be.revertedWith('exceeded VLP bottom')
  })

  it('getTriggerOrderInfo', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 0
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(posId)
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('57000'))
  })

  it('increasePosition for StopLoss', async () => {
    const indexToken = btc.address
    const amountIn = expandDecimals('100', 30)
    const toUsdAmount = expandDecimals('1000', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    const orderType = 0 // M
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
    const passTime = 60 * 60 * 24
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('addTriggerOrders 2', async () => {
    const indexToken = btc.address
    const isLong = true
    const posId = 1
    const isTPs = [true, false]
    const prices = [expandDecimals('57500', 30), expandDecimals('54000', 30)]
    const amountPercents = [50000, 100000]
    await OrderVault.addTriggerOrders(indexToken, isLong, posId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: 0,
    })
  })

  it('getTriggerOrderInfo', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 1
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(posId)
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('52000'))
  })

  it('triggerPosition 4', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 1
    // await expect(PositionVault.triggerForTPSL(posId)).to.be.revertedWith('exceeded VLP bottom')
  })

  it('getTriggerOrderInfo', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 1
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(posId)
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('57000'))
  })

  // note: this test is completely duplicated from another test in this file
  //    but it is needed for the other tests to not fail
  it('increasePosition for StopLoss', async () => {
    const indexToken = btc.address
    const amountIn = expandDecimals('100', 30)
    const toUsdAmount = expandDecimals('1000', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    const orderType = 0 // M
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')

    const passTime = 60 * 60 * 24
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('addTriggerOrders 3', async () => {
    const indexToken = btc.address
    const isLong = true
    const posId = 2
    const isTPs = [true, false]
    const prices = [expandDecimals('57500', 30), expandDecimals('54000', 30)]
    const amountPercents = [50000, 100000]
    await OrderVault.addTriggerOrders(indexToken, isLong, posId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: 0,
    })
  })

  it('cancelTriggerOrder', async () => {
    const indexToken = btc.address
    const isLong = true
    const posId = 2
    const orderId = 1
    await OrderVault.cancelTriggerOrder(posId, orderId)
  })

  it('cancelPositionTrigger', async () => {
    const indexToken = btc.address
    const isLong = true
    const posId = 2
    const triggerOrderInfo = await OrderVault.cancelPositionTrigger(posId)
  })

  it('getTriggerOrderInfo', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 2
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(posId)
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('58500'))
  })

  it('triggerPosition 5', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 1
    // await expect(PositionVault.triggerForTPSL(posId)).to.be.revertedWith('exceeded VLP bottom')
  })

  it('validateTPSLTriggers for Long', async () => {
    const account = wallet.address
    const token = btc.address
    const isLong = true
    const posId = 2
    expect(await OrderVault.validateTPSLTriggers(token, isLong, posId)).eq(false)
  })

  it('validateTPSLTriggers for Short', async () => {
    const account = wallet.address
    const token = btc.address
    const isLong = false
    const posId = 4
    expect(await OrderVault.validateTPSLTriggers(token, isLong, posId)).eq(false)
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('57000'))
  })

  it('addTriggerOrdersData with wrong orders or invalid data for Long', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const pId = 2
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('57500', 30),
      expandDecimals('54000', 30),
      expandDecimals('58500', 30),
      expandDecimals('55000', 30),
    ]
    const amountPercents = [20000, 10000, 10000, 30000]
    await expect(
      OrderVault.addTriggerOrders(indexToken, isLong, pId, isTPs, prices, amountPercents, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('triggerOrder data are incorrect')
  })

  it('addTriggerOrdersData with position size = 0 for Long', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const pId = 4
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('57500', 30),
      expandDecimals('54000', 30),
      expandDecimals('58500', 30),
      expandDecimals('55000', 30),
    ]
    const amountPercents = [20000, 10000, 10000, 30000]
    await expect(
      OrderVault.addTriggerOrders(indexToken, isLong, pId, isTPs, prices, amountPercents, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('position size should be greater than zero')
  })

  it('addTriggerOrdersData for Long', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const pId = 2
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('57500', 30),
      expandDecimals('58000', 30),
      expandDecimals('58500', 30),
      expandDecimals('55000', 30),
    ]
    const amountPercents = [20000, 10000, 10000, 30000]
    await OrderVault.addTriggerOrders(indexToken, isLong, pId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: 0,
    })
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(pId)
  })

  it('triggerPosition Trigger Not Open for Long', async () => {
    const account = wallet.address
    const token = btc.address
    const isLong = true
    const posId = 2
    await expect(PositionVault.triggerForTPSL(posId)).to.be.revertedWith('Trigger Not Open')
  })

  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('57000'))
  })

  it('increasePosition for Short', async () => {
    const indexToken = btc.address
    const amountIn = expandDecimals('100', 30)
    const toUsdAmount = expandDecimals('1000', 30)
    const isLong = false
    const referAddress = ethers.constants.AddressZero
    const orderType = 0 // M
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
  })

  it('addTriggerOrdersData with wrong orders or invalid for Short', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = false
    const pId = 3
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('56500', 30),
      expandDecimals('56000', 30),
      expandDecimals('59500', 30),
      expandDecimals('58000', 30),
    ]
    const amountPercents = [20000, 10000, 10000, 30000]
    await expect(
      OrderVault.addTriggerOrders(indexToken, isLong, pId, isTPs, prices, amountPercents, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('triggerOrder data are incorrect')
  })

  it('addTriggerOrdersData with position size = 0 for Short', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = false
    const pId = 4
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('57500', 30),
      expandDecimals('54000', 30),
      expandDecimals('58500', 30),
      expandDecimals('55000', 30),
    ]
    const amountPercents = [20000, 10000, 10000, 30000]
    await expect(
      OrderVault.addTriggerOrders(indexToken, isLong, pId, isTPs, prices, amountPercents, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('position size should be greater than zero')
  })

  it('addTriggerOrdersData for Short', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = false
    const pId = 3
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('56500', 30),
      expandDecimals('56000', 30),
      expandDecimals('55500', 30),
      expandDecimals('58000', 30),
    ]
    const amountPercents = [20000, 10000, 10000, 30000]
    await OrderVault.addTriggerOrders(indexToken, isLong, pId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: 0,
    })
    const triggerOrderInfo = await OrderVault.getTriggerOrderInfo(pId)
  })

  it('triggerPosition trigger not ready for Short', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = false
    const pId = 3
    await expect(PositionVault.triggerForTPSL(pId)).to.be.revertedWith('trigger not ready')
  })
  it('setLatestAnswer for BTC', async () => {
    await priceFeed.setLatestAnswer(btc.address, toChainlinkPrice('56200'))
  })

  it('validateTPSL for Short after rising price', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = false
    const pId = 3
    expect(await OrderVault.validateTPSLTriggers(indexToken, isLong, pId)).eq(true)
  })

  it('executeTriggerOrders for Short', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = false
    const pId = 3
    const passTime = 60 * 60 * 2
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    // await expect(PositionVault.triggerForTPSL(pId)).to.be.revertedWith("maxLeverage exceeded")
  })
})
