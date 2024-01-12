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

describe('PriceManager', function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vlp
  let priceManager
  let btc
  let eth
  let doge
  let gbp
  let eur
  let jpy
  let usdc
  let usdt
  let operator
  let priceFeed
  let vlpPriceFeed
  let cooldownDuration
  let feeRewardBasisPoints // FeeRewardBasisPoints 70%

  before(async function () {
    priceFeed = await deployContract('FastPriceFeed', [])
    btc = await deployContract('BaseToken', ['Bitcoin', 'BTC', 0])
    eth = await deployContract('BaseToken', ['Ethereum', 'ETH', 0])
    doge = await deployContract('BaseToken', ['Dogecoin', 'DOGE', 0])
    gbp = await deployContract('BaseToken', ['Pound Sterling', 'GBP', 0])
    eur = await deployContract('BaseToken', ['Euro', 'EUR', 0])
    jpy = await deployContract('BaseToken', ['Japanese Yan', 'JPY', 0])
    usdt = await deployContract('BaseToken', ['Tether USD', 'USDT', expandDecimals('10000000', 18)])
    usdc = await deployContract('BaseToken', ['USD Coin', 'USDC', expandDecimals('10000000', 18)])
    vlpPriceFeed = await deployContract('FastPriceFeed', [])
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
    priceManager = await deployContract('PriceManager', [
      operator.address, // operator
    ])
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

    const cryptoMaxLeverage = 100 * 10000
    const forexMaxLeverage = 100 * 10000
    await expect(
      priceManager.setTokenConfig(zeroAddress, 18, cryptoMaxLeverage, priceFeed.address, 8)
    ).to.be.revertedWith('Address is wrong')
    await expect(priceManager.setTokenConfig(btc.address, 18, 1, priceFeed.address, 8)).to.be.revertedWith(
      'Max Leverage should be greater than Min Leverage'
    )
    await priceManager.setTokenConfig(btc.address, 18, cryptoMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(eth.address, 18, cryptoMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(gbp.address, 18, forexMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(eur.address, 18, forexMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(doge.address, 18, cryptoMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(jpy.address, 18, forexMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(usdc.address, 18, cryptoMaxLeverage, priceFeed.address, 8)
    await priceManager.setTokenConfig(usdt.address, 18, cryptoMaxLeverage, priceFeed.address, 8)
  })

  it('usdToToken 0', async () => {
    const _indexToken = btc.address
    const usdAmount = 0
    const tokenAmount = await priceManager.usdToToken(_indexToken, usdAmount)
    expect(tokenAmount).eq(0)
  })

  it('usdToToken not zero', async () => {
    const _indexToken = btc.address
    const usdAmount = 1000
    const tokenAmount = await priceManager.usdToToken(_indexToken, usdAmount)
    // expect(tokenAmount).eq(0)
  })

  it('tokenToUsd 0', async () => {
    const _indexToken = btc.address
    const tokenAmount = 0
    const usdAmount = await priceManager.tokenToUsd(_indexToken, tokenAmount)
    expect(usdAmount).eq(0)
  })

  it('tokenToUsd not zero', async () => {
    const _indexToken = btc.address
    const tokenAmount = 1000
    const usdAmount = await priceManager.tokenToUsd(_indexToken, tokenAmount)
    // expect(tokenAmount).eq(0)
  })

  it('getLastPrice', async () => {
    await expect(priceManager.getLastPrice(zeroAddress)).to.be.revertedWith('VaultPriceFeed: invalid price feed')
    const lastPrice = await priceManager.getLastPrice(btc.address)

    const _indexToken = btc.address
    await priceManager.getLastPrice(_indexToken)
  })

  it('setMaxLeverage', async () => {
    await priceManager.setMaxLeverage(eth.address, 50 * 10000)
    expect(parseInt(await priceManager.maxLeverage(eth.address))).to.be.equal(50 * 10000)
  })
})
