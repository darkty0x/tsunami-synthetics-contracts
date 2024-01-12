/**
 * The test runner for Dexpools Perpetual contract
 */

const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')
const { ethers, upgrades } = require('hardhat')

const { deployContract } = require('../../scripts/utils/helpers.js')
const { toUsd, expandDecimals, getBlockTime, bigNumberify, zeroAddress } = require('../../scripts/utils/utilities.js')
const { toChainlinkPrice } = require('../../scripts/utils/chainlink.js')

use(solidity)

describe('Vault', function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let now = parseInt(+new Date() / 1000)
  let trustForwarder
  let Reader
  let Vault
  let VaultUtils
  let LiquidateVault
  let OrderVault
  let PositionVault
  let vusd
  let vlp
  let vela
  let eVela
  let priceManager
  let settingsManager
  let positionManagerAddress
  let feeManagerAddress
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

  let depositFee
  let withdrawFee
  let stakingFee
  let unstakingFee

  let BASIS_POINTS_DIVISOR
  let PRICE_PRECISION
  let priceFeed
  let vaultPriceFeed
  let cooldownDuration
  let feeRewardBasisPoints // FeeRewardBasisPoints 70%

  let snapshot

  let btcPriceFeed = {
    // mock object
    setLatestAnswer: async function (price) {
      await priceFeed.setLatestAnswer(btc.address, price)
    },
  }

  before(async function () {
    trustForwarder = user3.address
    positionManagerAddress = user1.address
    feeManagerAddress = user3.address
    BASIS_POINTS_DIVISOR = 100000
    PRICE_PRECISION = expandDecimals('1', 30)
    vestingDuration = 6 * 30 * 24 * 60 * 60
    unbondingPeriod = 14 * 24 * 60 * 60
    cooldownDuration = 86400
    liquidationFeeUsd = toUsd(0) // _liquidationFeeUsd
    fundingInterval = 1 * 60 * 60 // fundingInterval = 8 hours
    fundingRateFactor = 100 //  fundingRateFactor
    feeRewardBasisPoints = 70000 // FeeRewardBasisPoints 70%
    depositFee = 300 // 0.3%
    withdrawFee = 300 // 0.3%
    stakingFee = 300 // 0.3%
    unstakingFee = 300 // 0.3%

    vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0])
    vlp = await deployContract('VLP', [])
    vela = await deployContract('Vela', [trustForwarder])
    eVela = await deployContract('eVELA', [])
    operator = await deployContract('Operators', [])
    tokenFarm = await deployContract('TokenFarm', [
      vestingDuration,
      eVela.address,
      vela.address,
      vlp.address,
      operator.address,
    ])
    //vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    priceManager = await deployContract('PriceManager', [operator.address])
    Vault = await deployContract('Vault', [operator.address, vlp.address, vusd.address])
    LiquidateVault = await deployContract('LiquidateVault', [])
    OrderVault = await deployContract('OrderVault', [])
    PositionVault = await deployContract('PositionVault', [Vault.address, priceManager.address])
    Reader = await deployContract('Reader', [])
    await Reader.initialize(PositionVault.address, OrderVault.address)
    operator.setOperator(PositionVault.address, 1)
    operator.setOperator(Vault.address, 1)

    priceFeed = await deployContract('FastPriceFeed', [])
    await priceFeed.setAdmin(priceManager.address, true)
    btc = await deployContract('BaseToken', ['Bitcoin', 'BTC', expandDecimals('10', 18)])
    eth = await deployContract('BaseToken', ['Ethereum', 'ETH', 0])
    doge = await deployContract('BaseToken', ['Dogecoin', 'DOGE', 0])
    gbp = await deployContract('BaseToken', ['Pound Sterling', 'GBP', 0])
    eur = await deployContract('BaseToken', ['Euro', 'EUR', 0])
    jpy = await deployContract('BaseToken', ['Japanese Yan', 'JPY', 0])
    usdc = await deployContract('BaseToken', ['USD Coin', 'USDC', expandDecimals('10000000', 18)])

    await expect(
      deployContract('SettingsManager', [
        LiquidateVault.address,
        zeroAddress,
        operator.address,
        vusd.address,
        tokenFarm.address,
      ])
    ).to.be.revertedWith('vault invalid')
    await expect(
      deployContract('SettingsManager', [
        LiquidateVault.address,
        PositionVault.address,
        operator.address,
        zeroAddress,
        tokenFarm.address,
      ])
    ).to.be.revertedWith('VUSD invalid')
    await expect(
      deployContract('SettingsManager', [
        LiquidateVault.address,
        PositionVault.address,
        operator.address,
        vusd.address,
        zeroAddress,
      ])
    ).to.be.revertedWith('tokenFarm invalid')
    settingsManager = await deployContract('SettingsManager', [
      LiquidateVault.address,
      PositionVault.address,
      operator.address,
      vusd.address,
      tokenFarm.address,
    ])
    await expect(
      deployContract('VaultUtils', [
        LiquidateVault.address,
        OrderVault.address,
        zeroAddress,
        priceManager.address,
        settingsManager.address,
      ])
    ).to.be.revertedWith('vault invalid')
    VaultUtils = await deployContract('VaultUtils', [
      LiquidateVault.address,
      OrderVault.address,
      PositionVault.address,
      priceManager.address,
      settingsManager.address,
    ])
    //====================== Vault Initialize ==============
    await expect(
      Vault.setVaultSettings(
        zeroAddress,
        settingsManager.address,
        PositionVault.address,
        OrderVault.address,
        LiquidateVault.address
      )
    ).to.be.revertedWith('priceManager invalid')
    await expect(
      Vault.setVaultSettings(
        priceManager.address,
        zeroAddress,
        PositionVault.address,
        OrderVault.address,
        LiquidateVault.address
      )
    ).to.be.revertedWith('settingsManager invalid')
    await expect(
      Vault.setVaultSettings(
        priceManager.address,
        settingsManager.address,
        zeroAddress,
        OrderVault.address,
        LiquidateVault.address
      )
    ).to.be.revertedWith('positionVault invalid')
    await Vault.setVaultSettings(
      priceManager.address,
      settingsManager.address,
      PositionVault.address,
      OrderVault.address,
      LiquidateVault.address
    )
    //====================== Position Vault Initialize ==============
    await expect(
      PositionVault.initialize(OrderVault.address, zeroAddress, settingsManager.address, VaultUtils.address)
    ).to.be.revertedWith('liquidateVault invalid')
    await expect(
      PositionVault.initialize(OrderVault.address, LiquidateVault.address, zeroAddress, VaultUtils.address)
    ).to.be.revertedWith('settingsManager invalid')
    await expect(
      PositionVault.initialize(OrderVault.address, LiquidateVault.address, settingsManager.address, zeroAddress)
    ).to.be.revertedWith('vaultUtils address is invalid')
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
    ]
    for (const token of tokens) {
      await priceManager.setTokenConfig(
        token.address,
        token.decimals,
        token.maxLeverage,
        token.priceFeed,
        token.priceDecimals
      )
      await settingsManager.setDepositFee(token.address, depositFee)
      await settingsManager.setWithdrawFee(token.address, withdrawFee)
      await settingsManager.setStakingFee(token.address, stakingFee)
      await settingsManager.setUnstakingFee(token.address, unstakingFee)
    }
    await vlp.transferOwnership(Vault.address) // vlp transferOwnership
    await settingsManager.setPositionManager(positionManagerAddress, true)
  })

  it('add Vault as admin', async () => {
    await vusd.transferOwnership(Vault.address) // addAdmin vault
  })

  it('Vault Initialize by settingsManager', async () => {
    //=======================================================
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
    const LONGMaxOpenInterest = expandDecimals('1000000000000', 30) // $1000,000,000,000
    const SHORTMaxOpenInterest = expandDecimals('1000000000000', 30) // $1000,000,000,000
    const USERMaxOpenInterest = expandDecimals('10000', 30) // $10000
    await settingsManager.setLiquidateThreshold(BTCLiquidateThreshold, btc.address)
    await settingsManager.setMarginFeeBasisPoints(btc.address, true, BTCLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(btc.address, false, BTCShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(ETHLiquidateThreshold, eth.address)
    await settingsManager.setMarginFeeBasisPoints(eth.address, true, ETHLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eth.address, false, ETHShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(DOGELiquidateThreshold, doge.address)
    await settingsManager.setMarginFeeBasisPoints(doge.address, true, DOGELongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(doge.address, false, DOGEShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(GBPLiquidateThreshold, gbp.address)
    await settingsManager.setMarginFeeBasisPoints(gbp.address, true, GBPLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(gbp.address, false, GBPShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(EURLiquidateThreshold, eur.address)
    await settingsManager.setMarginFeeBasisPoints(eur.address, true, EURLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(eur.address, false, EURShortMarginFeeBasisPoints)
    await settingsManager.setLiquidateThreshold(JPYLiquidateThreshold, jpy.address)
    await settingsManager.setMarginFeeBasisPoints(jpy.address, true, JPYLongMarginFeeBasisPoints)
    await settingsManager.setMarginFeeBasisPoints(jpy.address, false, JPYShortMarginFeeBasisPoints)
    await settingsManager.setMaxOpenInterestPerUser(USERMaxOpenInterest)
    await settingsManager.setEnableDeposit(usdc.address, true)
    //await settingsManager.setEnableWithdraw(usdc.address, true);
    await settingsManager.setEnableStaking(usdc.address, true)
    //await settingsManager.setEnableUnstaking(usdc.address, true);
    await settingsManager.setFeeManager(feeManagerAddress)
    await settingsManager.setMaxOpenInterestPerAsset(btc.address, BTCMaxOpenInterest)
    await settingsManager.setFundingRateFactor(btc.address, BTCLongFundingRateFactor)
    await settingsManager.setMaxOpenInterestPerAsset(eth.address, ETHMaxOpenInterest)
    await settingsManager.setFundingRateFactor(eth.address, ETHLongFundingRateFactor)
    await settingsManager.setMaxOpenInterestPerAsset(doge.address, DOGEMaxOpenInterest)
    await settingsManager.setFundingRateFactor(doge.address, DOGELongFundingRateFactor)
    await settingsManager.setMaxOpenInterestPerAsset(gbp.address, GBPMaxOpenInterest)
    await settingsManager.setFundingRateFactor(gbp.address, GBPLongFundingRateFactor)
    await settingsManager.setMaxOpenInterestPerAsset(eur.address, EURMaxOpenInterest)
    await settingsManager.setFundingRateFactor(eur.address, EURLongFundingRateFactor)
    await settingsManager.setMaxOpenInterestPerAsset(jpy.address, JPYMaxOpenInterest)
    await settingsManager.setFundingRateFactor(jpy.address, JPYLongFundingRateFactor)
  })

  it('deposit with General Token', async () => {
    const amount = expandDecimals('1', 18)
    const collateralDeltaUsd = await priceManager.tokenToUsd(btc.address, amount)
    await btc.connect(wallet).approve(Vault.address, amount) // approve BTC
    await expect(Vault.deposit(wallet.address, btc.address, amount)).to.be.revertedWith('deposit not allowed') // deposit BTC
  })

  it('deposit with Stable Coins', async () => {
    const amount = expandDecimals('1000', 18)
    const collateralDeltaUsd = await priceManager.tokenToUsd(usdc.address, amount)
    await usdc.connect(wallet).approve(Vault.address, amount) // approve USDC
    await Vault.deposit(wallet.address, usdc.address, amount) // deposit USDC
    expect(await vusd.balanceOf(wallet.address)).eq(
      collateralDeltaUsd
        .mul(bigNumberify(BASIS_POINTS_DIVISOR).sub(bigNumberify(depositFee)))
        .div(bigNumberify(BASIS_POINTS_DIVISOR))
    )
  })

  it('depositFor with Stable Coins', async () => {
    const amount = expandDecimals('1000', 18)
    await usdc.connect(wallet).transfer(user1.address, amount)
    const originalVLPBalance = await vusd.balanceOf(wallet.address)
    const collateralDeltaUsd = await priceManager.tokenToUsd(usdc.address, amount)
    await usdc.connect(user1).approve(Vault.address, amount) // approve USDC
    await expect(Vault.connect(user1).deposit(wallet.address, usdc.address, amount)).to.be.revertedWith('Not allowed') // deposit USDC
    await settingsManager.connect(wallet).delegate([user1.address, user0.address])
    expect(await settingsManager.checkDelegation(wallet.address, user1.address)).eq(true)
    await Vault.connect(user1).deposit(wallet.address, usdc.address, amount) // deposit USDC
    expect(await vusd.balanceOf(wallet.address)).eq(
      collateralDeltaUsd
        .mul(bigNumberify(BASIS_POINTS_DIVISOR).sub(bigNumberify(depositFee)))
        .div(bigNumberify(BASIS_POINTS_DIVISOR))
        .add(originalVLPBalance)
    )
    await settingsManager.connect(wallet).undelegate([user1.address, user0.address])
  })

  it('depositFor by globalDelegates', async () => {
    await settingsManager.connect(wallet).setGlobalDelegates(user2.address, false)
    expect(await settingsManager.checkDelegation(wallet.address, user2.address)).eq(false)
    const amount = expandDecimals('1000', 18)
    await usdc.connect(wallet).transfer(user2.address, amount)
    const originalVLPBalance = await vusd.balanceOf(wallet.address)
    const collateralDeltaUsd = await priceManager.tokenToUsd(usdc.address, amount)
    await usdc.connect(user2).approve(Vault.address, amount) // approve USDC
    await expect(Vault.connect(user2).deposit(wallet.address, usdc.address, amount)).to.be.revertedWith('Not allowed') // deposit USDC
    await settingsManager.connect(wallet).setGlobalDelegates(user2.address, true)
    expect(await settingsManager.checkDelegation(wallet.address, user2.address)).eq(true)
    await Vault.connect(user2).deposit(wallet.address, usdc.address, amount) // deposit USDC
    expect(await vusd.balanceOf(wallet.address)).eq(
      collateralDeltaUsd
        .mul(bigNumberify(BASIS_POINTS_DIVISOR).sub(bigNumberify(depositFee)))
        .div(bigNumberify(BASIS_POINTS_DIVISOR))
        .add(originalVLPBalance)
    )
  })

  it('stake with General Token', async () => {
    const amount = expandDecimals('1', 18)
    const collateralDeltaUsd = await priceManager.tokenToUsd(btc.address, amount)
    await btc.connect(wallet).approve(Vault.address, amount) // stake BTC
    // await vlp.connect(wallet).approve(Vault.address, amount) // stake BTC
    await expect(Vault.stake(wallet.address, btc.address, amount)).to.be.revertedWith('staking disabled') // stake BTC
  })

  it('stake with Stable Coins ', async () => {
    const defaultVLPPrice = await Vault.getVLPPrice()
    const amount = expandDecimals('1000', 18)
    const collateralDeltaUsd = await priceManager.tokenToUsd(usdc.address, amount)
    await usdc.connect(wallet).approve(Vault.address, amount) // approve USDC
    await Vault.stake(wallet.address, usdc.address, amount) // deposit USDC
  })

  it('stakeFor with Stable Coins', async () => {
    const amount = expandDecimals('1000', 18)
    await usdc.connect(wallet).transfer(user1.address, amount)
    const totalUSD = await Vault.totalUSD()
    const totalVLP = await vlp.totalSupply()
    expect(await Vault.getVLPPrice()).eq(
      bigNumberify(BASIS_POINTS_DIVISOR).mul(expandDecimals('1', 18)).mul(totalUSD).div(totalVLP).div(PRICE_PRECISION)
    )
    const originalVLPBalance = await vlp.balanceOf(wallet.address)
    const collateralDeltaUsd = await priceManager.tokenToUsd(usdc.address, amount)
    await usdc.connect(user1).approve(Vault.address, amount) // approve USDC
    await expect(Vault.connect(user1).stake(wallet.address, usdc.address, amount)).to.be.revertedWith('Not allowed') // stake USDC
    await settingsManager.connect(wallet).delegate([user1.address, user0.address])
    expect(await settingsManager.checkDelegation(wallet.address, user1.address)).eq(true)
    await Vault.connect(user1).stake(wallet.address, usdc.address, amount) // stake USDC
  })

  it('stakeFor by globalDelegates', async () => {
    await settingsManager.connect(wallet).setGlobalDelegates(user2.address, false)
    const amount = expandDecimals('1000', 18)
    await usdc.connect(wallet).transfer(user2.address, amount)
    const totalUSD = await Vault.totalUSD()
    const totalVLP = await vlp.totalSupply()
    await usdc.connect(user2).approve(Vault.address, amount) // approve USDC
    await expect(Vault.connect(user2).stake(wallet.address, usdc.address, amount)).to.be.revertedWith('Not allowed') // stake USDC
    await settingsManager.connect(wallet).setGlobalDelegates(user2.address, true)
    expect(await settingsManager.checkDelegation(wallet.address, user2.address)).eq(true)
    await Vault.connect(user2).stake(wallet.address, usdc.address, amount) // stake USDC
  })

  /*it("withdraw with General Token", async () => {
      const amount = expandDecimals('10', 30)
      await expect(Vault.withdraw(btc.address, wallet.address, amount))
        .to.be.revertedWith("withdraw disabled"); // deposit BTC
   })*/ //no disable withdraw

  it('withdraw with Stable Coins', async () => {
    const vusdAmount = expandDecimals('100', 30)
    const orignalUSDCBalance = await usdc.balanceOf(wallet.address)
    const collateralToken = await priceManager.usdToToken(usdc.address, vusdAmount)
    await Vault.withdraw(usdc.address, vusdAmount)
    expect(await usdc.balanceOf(wallet.address)).eq(
      collateralToken
        .mul(bigNumberify(BASIS_POINTS_DIVISOR).sub(bigNumberify(withdrawFee)))
        .div(bigNumberify(BASIS_POINTS_DIVISOR))
        .add(orignalUSDCBalance)
    )
  })

  /*
  it('withdrawFor', async () => {
    const vusdAmount = expandDecimals('100', 30)
    const orignalUSDCBalance = await usdc.balanceOf(wallet.address)
    const collateralToken = await priceManager.usdToToken(usdc.address, vusdAmount)
    await expect(Vault.connect(user2).withdraw(usdc.address, wallet.address, vusdAmount)).to.be.revertedWith(
      'Not allowed'
    )
    await settingsManager.delegate([user2.address])
    await Vault.connect(user2).withdraw(usdc.address, wallet.address, vusdAmount)
    expect(await usdc.balanceOf(wallet.address)).eq(
      collateralToken
        .mul(bigNumberify(BASIS_POINTS_DIVISOR).sub(bigNumberify(withdrawFee)))
        .div(bigNumberify(BASIS_POINTS_DIVISOR))
        .add(orignalUSDCBalance)
    )
  })*/ //no withdrawFor

  /*it("unstake with General Token", async () => {
    const amount = expandDecimals('10', 18)
    await expect(Vault.unstake(btc.address, amount, wallet.address))
      .to.be.revertedWith("unstaking disabled"); // deposit BTC
  })*/ //no disable unstaking

  it('unstake with Stable Coins', async () => {
    const vlpAmount = expandDecimals('10', 18)
    const orignalUSDCBalance = await usdc.balanceOf(wallet.address)
    // const collateralToken = await priceManager.usdToToken(usdc.address, vusdAmount);
    await expect(Vault.unstake(usdc.address, expandDecimals('10000', 18))).to.be.revertedWith(
      'vlpAmount error'
    )
    // await expect(Vault.unstake(usdc.address, vlpAmount, wallet.address)).to.be.revertedWith(
    //   'cooldown duration not yet passed'
    // )
    // const totalUSD = await Vault.totalUSD()
    // const totalVLP = await vlp.totalSupply()
    // const usdAmount = vlpAmount.mul(totalUSD).div(totalVLP)
    // const usdAmountFee = usdAmount.mul(bigNumberify(unstakingFee)).div(bigNumberify(BASIS_POINTS_DIVISOR))
    // const usdAmountAfterFee = usdAmount.sub(usdAmountFee)
    // const amountOut = await priceManager.usdToToken(usdc.address, usdAmountAfterFee)
    // const passTime = 60 * 60 * 6
    // await ethers.provider.send('evm_increaseTime', [passTime])
    // await ethers.provider.send('evm_mine')
    // await Vault.unstake(usdc.address, vlpAmount, wallet.address)
    // expect(await usdc.balanceOf(wallet.address)).eq(amountOut.add(orignalUSDCBalance))
  })

  async function expectMarketOrderFail(token, price, errorReason) {
    expect(await PositionVault.getNumOfUnexecutedMarketOrders()).eq(1)
    const now = await priceManager.getCurrentTime()
    await priceManager.setPrice(token.address, now, toChainlinkPrice(price))
    const tx = await PositionVault.connect(user1).executeOpenMarketOrders(1)
    const receipt = await tx.wait()
    //console.log(receipt)
    const errorEvent = receipt.events.find((event) => event.event === 'MarketOrderExecutionError')
    expect(errorEvent.args.err).eq(errorReason)
  }

  async function expectMarketOrderSuccess(token, price) {
    expect(await PositionVault.getNumOfUnexecutedMarketOrders()).eq(1)
    const now = await priceManager.getCurrentTime()
    await priceManager.setPrice(token.address, now, toChainlinkPrice(price))
    const tx = await PositionVault.connect(user1).executeOpenMarketOrders(1)
    const receipt = await tx.wait()
    const errorEvent = receipt.events.find((event) => event.event === 'MarketOrderExecutionError')
    expect(errorEvent).to.be.undefined
  }

  it('Long IncreasePosition for Market Order', async () => {
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const orderType = 0 // M
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    //await btcPriceFeed.setLatestAnswer(toChainlinkPrice('59000'))
    await Vault.connect(wallet).newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderFail(btc, '59000', 'long: slippage exceeded')
    //await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
    await Vault.connect(wallet).newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
    //console.log(await PositionVault.getPosition((await PositionVault.lastPosId())-1))
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('addTriggerOrders', async () => {
    const indexToken = btc.address
    const isLong = true
    const posId = (await PositionVault.lastPosId()) - 1
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('57500', 30),
      expandDecimals('58200', 30),
      expandDecimals('59000', 30),
      expandDecimals('54000', 30),
    ]
    const amountPercents = [50000, 30000, 20000, 100000]
    await OrderVault.addTriggerOrders(indexToken, isLong, posId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: 0,
    })
  })

  it('addPosition', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = (await PositionVault.lastPosId()) - 1
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    await Vault.addPosition(posId, amountIn, toUsdAmount, expectedMarketPrice)
    // await getUserAlivePositions(account) //todo: add test for this view function
  })

  it('increasePosition for triggerPosition', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const orderType = 0 // M
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.connect(wallet).newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    await expect(PositionVault.triggerForTPSL(posId)).to.be.revertedWith('Trigger Not Open')
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('addTriggerOrders for triggerPosition', async () => {
    const indexToken = btc.address
    const isLong = true
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const isTPs = [true, true, true, false]
    const prices = [
      expandDecimals('57500', 30),
      expandDecimals('58200', 30),
      expandDecimals('59000', 30),
      expandDecimals('54000', 30),
    ]
    const amountPercents = [50000, 30000, 20000, 100000]
    await OrderVault.addTriggerOrders(indexToken, isLong, posId, isTPs, prices, amountPercents, {
      from: wallet.address,
      value: 0,
    })
  })

  it('triggerForTPSL', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('58000'))
    await PositionVault.triggerForTPSL(posId, {
      from: wallet.address,
      value: 0,
    })
  })

  it('addTrailingStop for Long with trailing type = percent', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
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
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const position = await PositionVault.getPosition(posId)
    const stepType = 1
    const stpPrice1 = expandDecimals('56500', 30)
    const stepAmount = 1000 // 1 %
    const triggerData0 = [expandDecimals('15', 30), expandDecimals('150', 30), stepType, stpPrice1, stepAmount]
    const triggerData1 = [collateral, size, stepType, expandDecimals('57500', 30), stepAmount]
    const triggerData2 = [collateral, size, stepType, stpPrice1, 150000]
    const triggerData = [collateral, size, stepType, stpPrice1, stepAmount]
    await expect(
      Vault.addTrailingStop(posId, triggerData0, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('trailing size should be smaller than position size')
    await expect(
      Vault.addTrailingStop(posId, triggerData1, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('invalid trailing data')
    await expect(
      Vault.addTrailingStop(posId, triggerData2, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('percent cant exceed 100%')
    await Vault.addTrailingStop(posId, triggerData, {
      from: wallet.address,
      value: 0,
    })
    await expect(OrderVault.connect(user0).updateTrailingStop(posId)).to.be.revertedWith('updateTStop not allowed')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('56950'))
    await expect(OrderVault.updateTrailingStop(posId)).to.be.revertedWith('price incorrect')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57600'))
    await OrderVault.updateTrailingStop(posId)
    const validateTriggerBeforePriceChange = await VaultUtils.validateTrigger(indexToken, isLong, posId)
    if (validateTriggerBeforePriceChange) {
      await PositionVault.triggerForOpenOrders(account, posId, {
        from: wallet.address,
        value: 0,
      })
    } else {
      await expect(
        PositionVault.triggerForOpenOrders(account, posId, {
          from: wallet.address,
          value: 0,
        })
      ).to.be.revertedWith('trigger not ready')
    }
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('56400'))
    const closeDeltaTime = await settingsManager.closeDeltaTime()
    await ethers.provider.send('evm_increaseTime', [closeDeltaTime.toNumber()])
    await ethers.provider.send('evm_mine')
    await PositionVault.triggerForOpenOrders(account, posId, {
      from: wallet.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('addTrailingStop for Long with trailing type = amount', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
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
    //await PositionVault.connect(user1).executeOpenMarketOrdersWithPrices(1, [btc.address], [toChainlinkPrice('57000')])
    await expectMarketOrderSuccess(btc, '57000')
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const stepType = 0
    const stpPrice1 = expandDecimals('56700', 30)
    const stepAmount = expandDecimals('400', 30)
    const triggerData0 = [expandDecimals('15', 30), expandDecimals('150', 30), stepType, stpPrice1, stepAmount]
    const triggerData1 = [collateral, size, stepType, expandDecimals('57500', 30), stepAmount]
    const triggerData2 = [collateral, size, stepType, stpPrice1, expandDecimals('57200', 30)]
    const triggerData = [collateral, size, stepType, stpPrice1, stepAmount]
    await expect(
      Vault.addTrailingStop(posId, triggerData0, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('trailing size should be smaller than position size')
    await expect(
      Vault.addTrailingStop(posId, triggerData1, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('invalid trailing data')
    await expect(
      Vault.addTrailingStop(posId, triggerData2, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('step amount cant exceed price')
    await Vault.addTrailingStop(posId, triggerData, {
      from: wallet.address,
      value: 0,
    })
    await expect(OrderVault.connect(user0).updateTrailingStop(posId)).to.be.revertedWith('updateTStop not allowed')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('56950'))
    await expect(OrderVault.updateTrailingStop(posId)).to.be.revertedWith('price incorrect')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57200'))
    await OrderVault.updateTrailingStop(posId)
    const validateTriggerBeforePriceChange = await VaultUtils.validateTrigger(indexToken, isLong, posId)
    if (validateTriggerBeforePriceChange) {
      await PositionVault.triggerForOpenOrders(account, posId, {
        from: wallet.address,
        value: 0,
      })
    } else {
      await expect(
        PositionVault.triggerForOpenOrders(account, posId, {
          from: wallet.address,
          value: 0,
        })
      ).to.be.revertedWith('trigger not ready')
    }
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('56500'))
    await PositionVault.triggerForOpenOrders(account, posId, {
      from: wallet.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('addTrailingStop for Short with trailing type = percent', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = ethers.constants.AddressZero
    const orderType = 0 // M
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderFail(btc, '55000', 'short: slippage exceeded')
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')

    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const stepType = 1
    const stpPrice1 = expandDecimals('57500', 30)
    const stepAmount = 1000 // 1%
    const triggerData = [collateral, size, stepType, stpPrice1, stepAmount]
    const triggerData0 = [expandDecimals('15', 30), expandDecimals('150', 30), stepType, stpPrice1, stepAmount]
    const triggerData1 = [collateral, size, stepType, expandDecimals('56500', 30), stepAmount]
    const triggerData2 = [collateral, size, stepType, stpPrice1, 150000]
    await expect(
      Vault.addTrailingStop(posId, triggerData0, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('trailing size should be smaller than position size')
    await expect(Vault.addTrailingStop(posId, triggerData1)).to.be.revertedWith('invalid trailing data')
    await expect(
      Vault.addTrailingStop(posId, triggerData2, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('percent cant exceed 100%')
    await Vault.addTrailingStop(posId, triggerData, {
      from: wallet.address,
      value: 0,
    })
    await expect(OrderVault.connect(user0).updateTrailingStop(posId)).to.be.revertedWith('updateTStop not allowed')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57050'))
    await expect(OrderVault.updateTrailingStop(posId)).to.be.revertedWith('price incorrect')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('55200'))
    await OrderVault.updateTrailingStop(posId)
    const validateTriggerBeforePriceChange = await VaultUtils.validateTrigger(indexToken, isLong, posId)
    if (validateTriggerBeforePriceChange) {
      await PositionVault.triggerForOpenOrders(account, posId, {
        from: wallet.address,
        value: 0,
      })
    } else {
      await expect(
        PositionVault.triggerForOpenOrders(account, posId, {
          from: wallet.address,
          value: 0,
        })
      ).to.be.revertedWith('trigger not ready')
    }
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('58500'))
    await PositionVault.triggerForOpenOrders(account, posId, {
      from: wallet.address,
      value: 0,
    })
  })

  it('addTrailingStop for Short with trailing type = Amount', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
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
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const stepType = 0
    const stpPrice1 = expandDecimals('57100', 30)
    const stepAmount = expandDecimals('400', 30)
    const triggerData0 = [expandDecimals('15', 30), expandDecimals('150', 30), stepType, stpPrice1, stepAmount]
    const triggerData1 = [collateral, size, stepType, expandDecimals('56500', 30), stepAmount]
    const triggerData = [collateral, size, stepType, stpPrice1, stepAmount]
    await expect(
      Vault.addTrailingStop(posId, triggerData0, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('trailing size should be smaller than position size')
    await expect(
      Vault.addTrailingStop(posId, triggerData1, {
        from: wallet.address,
        value: 0,
      })
    ).to.be.revertedWith('invalid trailing data')
    await Vault.addTrailingStop(posId, triggerData, {
      from: wallet.address,
      value: 0,
    })
    await expect(OrderVault.connect(user0).updateTrailingStop(posId)).to.be.revertedWith('updateTStop not allowed')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57050'))
    await expect(OrderVault.updateTrailingStop(posId)).to.be.revertedWith('price incorrect')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('56500'))
    await OrderVault.updateTrailingStop(posId)
    const validateTriggerBeforePriceChange = await VaultUtils.validateTrigger(indexToken, isLong, posId)
    if (validateTriggerBeforePriceChange) {
      await PositionVault.triggerForOpenOrders(account, posId, {
        from: wallet.address,
        value: 0,
      })
    } else {
      await expect(
        PositionVault.triggerForOpenOrders(account, posId, {
          from: wallet.address,
          value: 0,
        })
      ).to.be.revertedWith('trigger not ready')
    }
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('58000'))
    const closeDeltaTime = await settingsManager.closeDeltaTime()
    await ethers.provider.send('evm_increaseTime', [closeDeltaTime.toNumber()])
    await ethers.provider.send('evm_mine')
    await PositionVault.triggerForOpenOrders(account, posId, {
      from: wallet.address,
      value: 0,
    })
  })

  it('increasePosition for Limit -> Long', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    const orderType = 1 // Limit
    const lmtPrice = expandDecimals('57500', 30)
    const stpPrice = 0
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices0 = [0, stpPrice, collateral, size]
    expect(
      Vault.newPositionOrder(
        indexToken, //_indexToken
        isLong,
        orderType,
        triggerPrices0, //triggerPrices
        referAddress,
        { from: wallet.address, value: 0 }
      )
    ).to.be.revertedWith('limit price is invalid')
    const triggerPrices = [lmtPrice, stpPrice, collateral, size]
    const newTriggerGasFee = expandDecimals('1', 16)
    const feeManagerBalanceBefore = await ethers.provider.getBalance(feeManagerAddress)
    await settingsManager.setTriggerGasFee(newTriggerGasFee)
    await expect(
      Vault.newPositionOrder(
        indexToken, //_indexToken
        isLong,
        orderType,
        triggerPrices, //triggerPrices
        referAddress,
        { from: wallet.address, value: 0 }
      )
    ).to.be.revertedWith('invalid triggerGasFee')
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress,
      { from: wallet.address, value: newTriggerGasFee }
    )
    expect(await ethers.provider.getBalance(feeManagerAddress)).eq(feeManagerBalanceBefore.add(newTriggerGasFee))
    await settingsManager.setTriggerGasFee(0)
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const account = wallet.address
    await PositionVault.connect(user1).triggerForOpenOrders(account, posId, {
      from: user1.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('increasePosition for Limit -> Short', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = ethers.constants.AddressZero
    const orderType = 1 // M
    const lmtPrice = expandDecimals('56500', 30)
    const stpPrice = 0
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices0 = [0, stpPrice, collateral, size]

    expect(
      Vault.newPositionOrder(
        indexToken, //_indexToken
        isLong,
        orderType,
        triggerPrices0, //triggerPrices
        referAddress,
        { from: wallet.address, value: 0 }
      )
    ).to.be.revertedWith('limit price is invalid')

    const triggerPrices = [lmtPrice, stpPrice, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress,
      { from: wallet.address, value: 0 }
    )
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const account = wallet.address
    await PositionVault.connect(user1).triggerForOpenOrders(account, posId, {
      from: user1.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('increasePosition for Stop Market -> Long', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    const orderType = 2 // Stop Market
    const lmtPrice = 0
    const stpPrice = expandDecimals('56500', 30)
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [lmtPrice, stpPrice, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress,
      { from: wallet.address, value: 0 }
    )
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const account = wallet.address
    await PositionVault.connect(user1).triggerForOpenOrders(account, posId, {
      from: user1.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('increasePosition for Stop Market -> Short', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = ethers.constants.AddressZero
    const orderType = 2 // Stop Market
    const lmtPrice = 0
    const stpPrice = expandDecimals('57500', 30)
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [lmtPrice, stpPrice, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress,
      { from: wallet.address, value: 0 }
    )
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const account = wallet.address
    await PositionVault.connect(user1).triggerForOpenOrders(account, posId, {
      from: user1.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('increasePosition for Stop Limit -> Long', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    const orderType = 3 // Stop Market
    const lmtPrice = expandDecimals('57200', 30)
    const stpPrice = expandDecimals('56500', 30)
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices0 = [0, 0, collateral, size]
    await expect(
      Vault.newPositionOrder(
        indexToken, //_indexToken
        isLong,
        orderType,
        triggerPrices0, //triggerPrices
        referAddress,
        { from: wallet.address, value: 0 }
      )
    ).to.be.revertedWith('stop limit price is invalid')
    const triggerPrices = [lmtPrice, stpPrice, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress,
      { from: wallet.address, value: 0 }
    )
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const account = wallet.address
    await PositionVault.connect(user1).triggerForOpenOrders(account, posId, {
      from: user1.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('increasePosition for Stop Limit -> Short', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = ethers.constants.AddressZero
    const orderType = 3 // Stop Limit
    const lmtPrice = expandDecimals('56500', 30)
    const stpPrice = expandDecimals('57500', 30)
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices0 = [0, 0, collateral, size]
    await expect(
      Vault.newPositionOrder(
        indexToken, //_indexToken
        isLong,
        orderType,
        triggerPrices0, //triggerPrices
        referAddress,
        { from: wallet.address, value: 0 }
      )
    ).to.be.revertedWith('stop limit price is invalid')
    const triggerPrices = [lmtPrice, stpPrice, collateral, size]
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress,
      { from: wallet.address, value: 0 }
    )
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const account = wallet.address
    await PositionVault.connect(user1).triggerForOpenOrders(account, posId, {
      from: user1.address,
      value: 0,
    })
    const passTime = 60 * 60 * 1
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('cancelPendingOrder', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    await expect(Vault.cancelPendingOrder(0)).to.be.revertedWith('Not in Pending')
    snapshot = await ethers.provider.send('evm_snapshot', [])
    await Vault.cancelPendingOrder(posId)
  })

  it('cancelPendingOrders', async () => {
    await ethers.provider.send('evm_revert', [snapshot])
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    await Vault.cancelPendingOrders([posId])
  })

  it('cancel for Trailing Stop', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
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
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const stepType = 1
    const stpPrice1 = expandDecimals('56500', 30)
    const stepAmount = 1000 // 1 %
    const triggerData = [collateral, size, stepType, stpPrice1, stepAmount]
    await Vault.addTrailingStop(posId, triggerData, {
      from: wallet.address,
      value: 0,
    })
    await Vault.cancelPendingOrder(posId)
  })

  it('addCollateral', async () => {
    const indexToken = btc.address
    const isLong = true
    const posIds = (await Reader.getUserAlivePositions(wallet.address))[0]
    const posId = posIds[0]
    const isPlus = true
    const amount = expandDecimals('5', 30)
    await expect(Vault.addOrRemoveCollateral(posId, isPlus, expandDecimals('1500', 30))).to.be.revertedWith(
      'leverage cannot be less than 1'
    )
    await Vault.addOrRemoveCollateral(posId, isPlus, amount)
  })

  it('remove collateral', async () => {
    const posIds = (await Reader.getUserAlivePositions(wallet.address))[0]
    const posId = posIds[0]
    const isPlus = false
    const amount = expandDecimals('5', 30)
    const positionInfo = await PositionVault.getPosition(posId)
    await expect(Vault.addOrRemoveCollateral(posId, isPlus, positionInfo.collateral)).to.be.revertedWith(
      'maxLeverage exceeded'
    )
  })

  it('decreasePosition with full amount for Long1', async () => {

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
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
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const sizeDelta = expandDecimals('100', 30)
    // await expect(Vault.decreasePosition(
    //   indexToken,
    //   0,
    //   isLong,
    //   posId
    // )).to.be.revertedWith("position size should be greather than zero")
    await expect(
      Vault.connect(user0).decreasePosition(expandDecimals('1000', 30), expectedMarketPrice, posId)
    ).to.be.revertedWith('not allowed')
    await Vault.decreasePosition(sizeDelta, expectedMarketPrice, posId)
    await settingsManager.setCloseDeltaTime(0)
  })

  it('decreasePosition with partial amount for Long', async () => {
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const indexToken = btc.address
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const isLong = true
    const posIds = (await Reader.getUserAlivePositions(wallet.address))[0]
    const posId = posIds[0]
    await Vault.decreasePosition(expandDecimals('2', 30), expectedMarketPrice, posId)
  })

  it('liquidatePosition for Long', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 0
    await settingsManager.setPositionManager(wallet.address, true)
    // wallet is now the manager, can directly call liquidatePosition now
    await expect(LiquidateVault.liquidatePosition(posId)).to.be.revertedWith('not exceed or allowed')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(43800))
    const validateLiquidation = await VaultUtils.validateLiquidation(posId, false)
  })

  it('liquidatePosition not manager', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 1
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(13800))
    let [status, marginFee] = await VaultUtils.validateLiquidation(posId, false)
    expect(status.toNumber()).eq(1) //should be liquidatable

    let [bountyTeam, bountyFirstCaller, bountyResolver] = await settingsManager.bountyPercent()

    //user2 cannot directly liquidatePosition
    await expect(LiquidateVault.connect(user2).liquidatePosition(posId)).to.be.revertedWith(
      'not manager or not allowed before pendingTime'
    )
    await LiquidateVault.connect(user2).registerLiquidatePosition(posId)
    await expect(LiquidateVault.connect(user2).registerLiquidatePosition(posId)).to.be.revertedWith("not the firstCaller")
    await ethers.provider.send('evm_increaseTime', [5])
    // and user2 cannot liquidatePosition within the liquidationPendingTime 10s
    await expect(LiquidateVault.connect(user2).liquidatePosition(posId)).to.be.revertedWith(
      'not manager or not allowed before pendingTime'
    )

    snapshot = await ethers.provider.send('evm_snapshot', [])
    // the manager can do liquidatePosition in the liquidationPendingTime
    let vUSD_team_before = await vusd.balanceOf(feeManagerAddress)
    let vUSD_user2_before = await vusd.balanceOf(user2.address)
    let vUSD_user1_before = await vusd.balanceOf(user1.address)

    await LiquidateVault.connect(user1).liquidatePosition(posId) // user2 as firstCaller, and then user1 resolve
    expect((await vusd.balanceOf(feeManagerAddress)).sub(vUSD_team_before)).eq(
      marginFee.mul(bountyTeam).div(BASIS_POINTS_DIVISOR)
    )
    expect((await vusd.balanceOf(user2.address)).sub(vUSD_user2_before)).eq(
      marginFee.mul(bountyFirstCaller).div(BASIS_POINTS_DIVISOR)
    )
    expect((await vusd.balanceOf(user1.address)).sub(vUSD_user1_before)).eq(
      marginFee.mul(bountyResolver).div(BASIS_POINTS_DIVISOR)
    )

    await ethers.provider.send('evm_revert', [snapshot])
    await ethers.provider.send('evm_increaseTime', [10])

    // user2 can successfully do the liquidation after 10s
    await LiquidateVault.connect(user2).liquidatePosition(posId)
    expect((await vusd.balanceOf(feeManagerAddress)).sub(vUSD_team_before)).eq(
      marginFee.mul(bountyTeam).div(BASIS_POINTS_DIVISOR)
    )
    expect((await vusd.balanceOf(user2.address)).sub(vUSD_user2_before)).eq(
      marginFee.mul(bountyFirstCaller + bountyResolver).div(BASIS_POINTS_DIVISOR)
    )
    expect(await vusd.balanceOf(user1.address)).eq(vUSD_user1_before)
  })

  it('liquidatePosition for Long for checking maxThreshold exceeded', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posIds = (await Reader.getUserAlivePositions(wallet.address))[0]
    const posId = posIds[0]
    //console.log('posId:', posId)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(51800))
    const validateLiquidation = await VaultUtils.validateLiquidation(posId, false)
    expect(validateLiquidation[0].toNumber()).eq(2) // Liquidate Max Threshold
    //if (validateLiquidation[0].toNumber() == 2) { // Liquidate Max Threshold
    //  await expect(LiquidateVault.liquidatePosition(account, posId)).to.be.revertedWith("Vault: fees exceed collateral")
    //}
    await LiquidateVault.liquidatePosition(posId) //todo: becomes liquidatale?
  })

  it('create Market Order for testing liquidatePosition', async () => {
    const passTime = 60 * 60 * 18
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    await settingsManager.setReferEnabled(true)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const orderType = 0 // M
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.connect(wallet).newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
  })

  it('liquidatePosition for Long for checking fees exceed collateral', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = (await PositionVault.lastPosId()) - 1
    const passTime = 60 * 60 * 12
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(52300))
    const validateLiquidation = await VaultUtils.validateLiquidation(posId, false)
    if (validateLiquidation[0].toNumber() == 2) {
      // Liquidate Max Threshold
      await LiquidateVault.liquidatePosition(posId)
    }
  })

  it('create Market Order for testing liquidatePosition', async () => {
    const passTime = 60 * 60 * 18
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = ethers.constants.AddressZero
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice('57000'))
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const slippage = 1000 // 1%
    const orderType = 0 // M
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    await Vault.connect(wallet).newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
  })

  it('liquidatePosition for Long liquidation fees exceed collateral ', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = (await PositionVault.lastPosId()) - 1
    const passTime = 60 * 60 * 12
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const liquidateFeeUsd = expandDecimals('10', 30)
    await expect(settingsManager.setLiquidationFeeUsd(expandDecimals('160', 30))).to.be.revertedWith('Above max')
    await settingsManager.setLiquidationFeeUsd(liquidateFeeUsd)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(55220))
    const validateLiquidation = await VaultUtils.validateLiquidation(posId, false)
    if (validateLiquidation[0].toNumber() == 2) {
      // Liquidate Max Threshold
      await LiquidateVault.liquidatePosition(posId)
    }
  })

  it('validateLiquidation for non open position', async () => {
    const account = wallet.address
    const indexToken = btc.address
    const isLong = true
    const posId = 0
    const validateLiquidation = await VaultUtils.validateLiquidation(posId, true)
    expect(validateLiquidation[0]).eq(0)
  })

  it('decreasePosition with full amount for Long2', async () => {
    await settingsManager.setLiquidationFeeUsd(0)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = user0.address
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
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const sizeDelta = expandDecimals('100', 30)
    snapshot = await ethers.provider.send('evm_snapshot', [])
    await Vault.decreasePosition(sizeDelta, expectedMarketPrice, posId)
  })

  it('closePosition should work like decreasePosition with full amount', async () => {
    await ethers.provider.send('evm_revert', [snapshot])
    snapshot = await ethers.provider.send('evm_snapshot', [])
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    await Vault.closePosition(posId)
  })

  it('closePositions', async () => {
    await ethers.provider.send('evm_revert', [snapshot])
    const indexToken = eth.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = user0.address
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
    const lastPosId = await PositionVault.lastPosId()
    await Vault.closePositions([lastPosId - 2, lastPosId - 1])
  })

  it('long market order for checking decreasePosition at quick price movement', async () => {
    const closeDeltaTime = 60 * 60 * 1
    await settingsManager.setCloseDeltaTime(closeDeltaTime)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = true
    const referAddress = user0.address
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
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57500))
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const sizeDelta = expandDecimals('100', 30)
    await Vault.decreasePosition(sizeDelta, expectedMarketPrice, posId)
  })

  it('short market order for checking decreasePosition at quick price movement', async () => {
    const closeDeltaTime = 60 * 60 * 1
    await settingsManager.setCloseDeltaTime(closeDeltaTime)
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(57000))
    const account = wallet.address
    const indexToken = btc.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = user0.address
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
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(56500))
    const lastPosId = await PositionVault.lastPosId()
    const posId = lastPosId.toNumber() - 1
    const sizeDelta = expandDecimals('100', 30)
    await Vault.decreasePosition(sizeDelta, expectedMarketPrice, posId)
  })
  /*
  it ("pause Forex Market", async () => {
    await expect(settingsManager.connect(user2).pauseForexMarket(false))
      .to.be.revertedWith("invalid operator")
    await settingsManager.pauseForexMarket(true)
  })
*/
  it('create new position after pausing forex market', async () => {
    const closeDeltaTime = 60 * 60 * 1
    await settingsManager.setCloseDeltaTime(closeDeltaTime)
    const indexToken = gbp.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = user0.address
    const orderType = 0 // M
    const expectedMarketPrice = await priceManager.getLastPrice(indexToken)
    const expectedCryptoMarketPrice = await priceManager.getLastPrice(btc.address)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    const triggerPrices = [expectedMarketPrice, slippage, collateral, size]
    //await settingsManager.pauseForexMarket(true)
    await settingsManager.setIsIncreasingPositionDisabled(indexToken, true)
    expect(
      Vault.newPositionOrder(
        indexToken, //_indexToken
        isLong,
        orderType,
        triggerPrices, //triggerPrices
        referAddress
      )
    ).to.be.revertedWith('current asset is disabled from increasing position')
    await settingsManager.setIsIncreasingPositionDisabled(indexToken, false)
    //await settingsManager.pauseForexMarket(false)
    await Vault.newPositionOrder(
      indexToken, //_indexToken
      isLong,
      orderType,
      triggerPrices, //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(gbp, '15')
  })

  it('referFee managerFee', async () => {
    const closeDeltaTime = 60 * 60 * 1
    await settingsManager.setCloseDeltaTime(closeDeltaTime)
    const indexToken = gbp.address
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = user0.address
    const orderType = 0 // M
    const expectedCryptoMarketPrice = await priceManager.getLastPrice(btc.address)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    let referBalanceBefore = await vusd.balanceOf(referAddress)
    let managerBalanceBefore = await vusd.balanceOf(feeManagerAddress)
    await Vault.newPositionOrder(
      btc.address, //_indexToken
      isLong,
      orderType,
      [expectedCryptoMarketPrice, slippage, collateral, size], //triggerPrices
      referAddress
    )
    await expectMarketOrderSuccess(btc, '57000')
    let referBalanceAfter = await vusd.balanceOf(referAddress)
    let managerBalanceAfter = await vusd.balanceOf(feeManagerAddress)
    let fee = await settingsManager.getPositionFee(btc.address, isLong, size)
    let referFee = fee.mul(await settingsManager.referFee()).div(BASIS_POINTS_DIVISOR)
    expect(referFee).eq(referBalanceAfter.sub(referBalanceBefore))
    let managerFee = fee
      .sub(referFee)
      .mul(BASIS_POINTS_DIVISOR - (await settingsManager.feeRewardBasisPoints()))
      .div(BASIS_POINTS_DIVISOR)
    expect(managerFee).eq(managerBalanceAfter.sub(managerBalanceBefore))
  })

  it('checkBanWallet', async () => {
    const amountIn = expandDecimals('10', 30)
    const toUsdAmount = expandDecimals('100', 30)
    const isLong = false
    const referAddress = user0.address
    const orderType = 0 // M
    const expectedCryptoMarketPrice = await priceManager.getLastPrice(btc.address)
    const slippage = 1000 // 1%
    const collateral = amountIn
    const size = toUsdAmount
    await settingsManager.addDelegatesToBanList([wallet.address])
    await expect(
      Vault.connect(wallet).newPositionOrder(
        btc.address, //_indexToken
        isLong,
        orderType,
        [expectedCryptoMarketPrice, slippage, collateral, size], //triggerPrices
        referAddress
      )
    ).to.be.revertedWith('Account banned')
    await settingsManager.removeDelegatesFromBanList([wallet.address])
    await Vault.connect(wallet).newPositionOrder(
      btc.address, //_indexToken
      isLong,
      orderType,
      [expectedCryptoMarketPrice, slippage, collateral, size], //triggerPrices
      referAddress
    )
  })

  it('checkBanWallet delegation', async () => {
    const amount = expandDecimals('1000', 18)
    await settingsManager.addDelegatesToBanList([wallet.address])
    await expect(Vault.connect(wallet).stake(wallet.address, usdc.address, amount)).to.be.revertedWith('Account banned')
    await settingsManager.connect(wallet).delegate([user2.address])
    await expect(Vault.connect(user2).stake(wallet.address, usdc.address, amount)).to.be.revertedWith('account banned')
  })
})
