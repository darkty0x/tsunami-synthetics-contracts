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

describe('FastPriceFeed', function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let btc
  let btcPriceFeed
  let latestAt
  let mockPyth
  let priceId = "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b"; //btc testnet

  before(async function () {
    btc = await deployContract('BaseToken', ['Bitcoin', 'BTC', 0])
    btcPriceFeed = await deployContract('FastPriceFeed', [])
    mockPyth = await deployContract('MockPyth', [])
  })

  it('setAdmin', async () => {
    await expect(btcPriceFeed.connect(user0).setAdmin(user1.address, true)).to.be.revertedWith('PriceFeed: forbidden')
    await btcPriceFeed.connect(wallet).setAdmin(user1.address, true)
    expect(await btcPriceFeed.isAdmin(user1.address)).eq(true)
  })

  it('setDescription', async () => {
    await expect(btcPriceFeed.connect(user0).setDescription('BTC/USD')).to.be.revertedWith('PriceFeed: forbidden')
    await btcPriceFeed.connect(user1).setDescription('BTC/USD')
    expect(await btcPriceFeed.description()).eq('BTC/USD')
  })

  it('setLatestAnswer', async () => {
    await expect(btcPriceFeed.connect(user0).setLatestAnswer(btc.address, toChainlinkPrice(60000))).to.be.revertedWith(
      'PriceFeed: forbidden'
    )
    await btcPriceFeed.connect(user1).setLatestAnswer(btc.address, toChainlinkPrice(60000))
    const answer = await btcPriceFeed.latestAnswer(btc.address)
    latestAt = await getBlockTime(provider)
    expect(parseFloat(ethers.utils.formatUnits(answer, 8))).eq(60000)
  })

  it('getRoundData', async () => {
    const roundId = 1
    const roundData = await btcPriceFeed.getRoundData(btc.address, roundId)
    const answer = roundData[1]
    const roundLatestAt = roundData[2]
    expect(answer).eq(toChainlinkPrice(60000))
    expect(roundLatestAt).eq(latestAt)
  })

  it('latestRound', async () => {
    expect(await btcPriceFeed.latestRound(btc.address)).eq(1)
  })

  it('set Pyth', async()=>{
    expect(btcPriceFeed.connect(user0).setPyth(mockPyth.address)).to.be.revertedWith("PriceFeed: forbidden");
    await btcPriceFeed.setPyth(mockPyth.address);
  })

  it('setToken', async()=>{
    let now = await mockPyth.getCurrentTime();
    await mockPyth.setPrice(priceId, 2869078000000, -8, now);
    await btcPriceFeed.setToken(btc.address, priceId, 1000, 60); //allow 1% devivation
    expect(await btcPriceFeed.getPythLastPrice(btc.address, false)).equal(2869078000000)
  })

  it('can setAnswer within deviation', async()=>{
    let now = await mockPyth.getCurrentTime();
    await btcPriceFeed.setAnswer(btc.address, now, 2869079000000)
  })

  it('cannot setAnswer out of deviation', async()=>{
    let now = await mockPyth.getCurrentTime();
    expect(btcPriceFeed.setAnswer(btc.address, now, 1869079000000)).to.be.revertedWith("need update pyth price")
  })

  it('can read latestAnswer within expire time', async()=>{
    await ethers.provider.send('evm_increaseTime', [10])
    await ethers.provider.send('evm_mine')
    expect(await btcPriceFeed.latestAnswer(btc.address)).equal(2869079000000)
  })

  it('cannot read latestAnswer after expire time', async()=>{
    await ethers.provider.send('evm_increaseTime', [60])
    await ethers.provider.send('evm_mine')
    expect(btcPriceFeed.latestAnswer(btc.address)).to.be.revertedWith("price stale")
  })

  it('can read on-chain pyth price as fallback', async()=>{
    let now = await mockPyth.getCurrentTime();
    await mockPyth.setPrice(priceId, 2869080000000, -8, now);
    expect(await btcPriceFeed.latestAnswer(btc.address)).equal(2869080000000)
  })
})
