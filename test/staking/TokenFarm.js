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

describe('TokenFarm', function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vlp
  let vela
  let eVela
  let tokenFarm
  let operator
  let vestingDuration
  let LiquidateVault
  let OrderVault
  let PositionVault
  let complexRewardPerSec1 //vela pool
  let complexRewardPerSec2 //vlp pool
  let rewardPerSec1
  let rewardPerSec2
  let rewardPerSec3
  let endTimestamp1
  let endTimestamp2
  let endTimestamp3

  before(async function () {
    vestingDuration = 6 * 30 * 24 * 60 * 60
    unbondingPeriod = 14 * 24 * 60 * 60
    vlp = await deployContract('VLP', [])
    vela = await deployContract('MintableBaseToken', ['Vela Exchange', 'VELA', 0])
    eVela = await deployContract('eVELA', [])
    operator = await deployContract('Operators', [])
    tokenFarm = await deployContract('TokenFarm', [
      vestingDuration,
      eVela.address,
      vela.address,
      vlp.address,
      operator.address,
    ])
    await eVela.transferOwnership(tokenFarm.address)
    await vela.transferOwnership(wallet.address)
    const owner = await vela.owner()
    console.log('owner : ', owner, wallet.address)
    await vela.connect(wallet).mint(wallet.address, expandDecimals(10000000, 18)) // mint vela Token
    await vela.connect(wallet).approve(tokenFarm.address, expandDecimals('10000000', 18)) // VELA approve
    await tokenFarm.depositVelaForVesting(expandDecimals('10000000', 18))
    await vlp.transferOwnership(wallet.address)
    await vlp.connect(wallet).mint(wallet.address, expandDecimals(100000, 18)) // mint eVELA
    let vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0])
    let vault = await deployContract('Vault', [operator.address, vlp.address, vusd.address])
    let priceManager = await deployContract('PriceManager', [operator.address])
    LiquidateVault = await deployContract('LiquidateVault', [])
    OrderVault = await deployContract('OrderVault', [])
    PositionVault = await deployContract('PositionVault', [vault.address, priceManager.address])
    let settingsManager = await deployContract('SettingsManager', [
      LiquidateVault.address,
      PositionVault.address,
      operator.address,
      vusd.address,
      tokenFarm.address,
    ])
    await vlp.initialize(vault.address, settingsManager.address)
  })

  it('deploy ComplexRewardPerSec and add pool info to tokenFarm', async () => {
    const pId1 = 0 //for VELA/esVELA pool
    const pId2 = 1 //for VLP pool
    const currentTimestamp = await getBlockTime(provider)
    endTimestamp1 = currentTimestamp + 14 * 60 * 60 * 24 //1659716363  => delta 2,592,000
    endTimestamp2 = currentTimestamp + 30 * 60 * 60 * 24
    rewardPerSec1 = expandDecimals(8267, 12)
    rewardPerSec2 = expandDecimals(3858, 12)
    await vela.connect(wallet).mint(wallet.address, expandDecimals(100000, 18)) // mint vela Token
    await vela.connect(wallet).mint(user0.address, expandDecimals(100, 18)) // mint vela Token
    await vela.connect(wallet).mint(user1.address, expandDecimals(100, 18)) // mint vela Token
    await expect(
      deployContract('ComplexRewarderPerSec', [zeroAddress, tokenFarm.address, operator.address])
    ).to.be.revertedWith('constructor: reward token must be a valid contract')
    await expect(
      deployContract('ComplexRewarderPerSec', [eVela.address, zeroAddress, operator.address])
    ).to.be.revertedWith('constructor: FarmDistributor must be a valid contract')
    const vusd = await deployContract('VUSD', ['Vested USD', 'VUSD', 0])
    await expect(
      deployContract('ComplexRewarderPerSec', [vusd.address, tokenFarm.address, operator.address])
    ).to.be.revertedWith('constructor: reward token decimals must be inferior to 30')
    complexRewardPerSec1 = await deployContract('ComplexRewarderPerSec', [
      eVela.address,
      tokenFarm.address,
      operator.address,
    ])
    complexRewardPerSec2 = await deployContract('ComplexRewarderPerSec', [
      eVela.address,
      tokenFarm.address,
      operator.address,
    ])
    const amount = String(ethers.constants.MaxUint256)
    await eVela.connect(wallet).approve(complexRewardPerSec1.address, amount) // VELA approve
    await eVela.connect(wallet).approve(complexRewardPerSec2.address, amount) // VLP approve
    await complexRewardPerSec1.add(pId1, currentTimestamp)
    await expect(complexRewardPerSec1.add(pId1, currentTimestamp)).to.be.revertedWith('pool already exists')
    await complexRewardPerSec2.add(pId2, currentTimestamp)
    expect(await complexRewardPerSec1.currentEndTimestamp(pId1)).eq(0)
    expect(await complexRewardPerSec1.poolRewardsPerSec(pId1)).eq(0)
    await complexRewardPerSec1.addRewardInfo(
      pId1, //vela and esVELA pool
      endTimestamp1,
      rewardPerSec1
    )
    console.log("complexRewardPerSec1's esVela balance:", await eVela.balanceOf(complexRewardPerSec1.address))
    await complexRewardPerSec2.addRewardInfo(
      pId2, //vlp pool
      endTimestamp2,
      rewardPerSec2
    )
    await tokenFarm.setVelaPool([complexRewardPerSec1.address], true)
    await tokenFarm.setVlpPool([complexRewardPerSec2.address], true)
    await expect(tokenFarm.setVlpPool([zeroAddress], false)).to.be.revertedWith('set: rewarder must be contract')
  })

  it('Set RewardTierInfo', async () => {
    const levels = [
      expandDecimals('1000', 18),
      expandDecimals('5000', 18),
      expandDecimals('10000', 18),
      expandDecimals('25000', 18),
      expandDecimals('50000', 18),
      expandDecimals('100000', 18),
      expandDecimals('250000', 18),
      expandDecimals('500000', 18),
      expandDecimals('1000000', 18),
    ]
    const percents = [
      (100 - 2) * 1000,
      (100 - 3) * 1000,
      (100 - 5) * 1000,
      (100 - 10) * 1000,
      (100 - 15) * 1000,
      (100 - 20) * 1000,
      (100 - 30) * 1000,
      (100 - 40) * 1000,
      (100 - 50) * 1000,
    ]
    await tokenFarm.updateRewardTierInfo(levels, percents)
    const tierLevelOne = await tokenFarm.tierLevels(0)
    const tierPercentOne = await tokenFarm.tierPercents(0)
    const tierLevelNine = await tokenFarm.tierLevels(8)
    const tierPercentNine = await tokenFarm.tierPercents(8)
    expect(parseFloat(ethers.utils.formatUnits(tierLevelOne, 18))).eq(1000)
    expect(tierPercentOne.toNumber()).eq(98000)
    expect(parseFloat(ethers.utils.formatUnits(tierLevelNine, 18))).eq(1000000)
    expect(tierPercentNine.toNumber()).eq(50000)
  })

  it('checking startTimestamp', async () => {
    const passTime = 60 * 60 * 24 * 60
    await ethers.provider.send('evm_increaseTime', [-1 * passTime])
    await ethers.provider.send('evm_mine')
    const poolRewardsPerSec = await tokenFarm.poolRewardsPerSec(true)
    expect(poolRewardsPerSec.rewardsPerSec[0]).eq(0)
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const poolRewardsPerSec2 = await tokenFarm.poolRewardsPerSec(true)
    expect(poolRewardsPerSec2.rewardsPerSec[0]).gt(0)
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const poolRewardsPerSec3 = await tokenFarm.poolRewardsPerSec(true)
    expect(poolRewardsPerSec3.rewardsPerSec[0]).eq(0)
    await ethers.provider.send('evm_increaseTime', [-1 * passTime])
    await ethers.provider.send('evm_mine')
  })

  it('deposit VELA, enableLock = true ', async () => {
    const amount = expandDecimals('100', 18)
    await expect(tokenFarm.depositVela(amount)).to.be.revertedWith('BoringERC20: TransferFrom failed')
    await vela.approve(tokenFarm.address, amount)
    await tokenFarm.depositVela(amount)
    expect((await tokenFarm.velaUserInfo(wallet.address)).velaAmount).to.be.equal(amount)
  })

  it('withdraw VELA, amount not enough', async () => {
    const bigAmount = expandDecimals('10000', 18)
    await expect(tokenFarm.withdrawVela(bigAmount)).to.be.revertedWith('withdraw: user amount not enough')
  })

  it('withdraw with lock = true', async () => {
    const account = wallet.address
    const passTime = 60 * 10
    const amount = expandDecimals('10', 18)
    const amount2 = expandDecimals('105', 18)
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const pendingTokens = await tokenFarm.pendingTokens(
      true, //is vela pool
      account
    )
    await expect(tokenFarm.withdrawVela(amount2)).to.be.revertedWith('withdraw: user amount not enough')
    expect(pendingTokens.amounts[0]).gte(bigNumberify(0))
    //console.log(pendingTokens)
    await expect(tokenFarm.emergencyWithdrawVela()).to.be.revertedWith("didn't pass cooldownDuration")
    await expect(tokenFarm.withdrawVela(amount)).to.be.revertedWith("didn't pass cooldownDuration")

    const passTime2 = 60 * 60 * 24 * 7
    await ethers.provider.send('evm_increaseTime', [passTime2])
    await ethers.provider.send('evm_mine')
    await tokenFarm.withdrawVela(amount)
  })

  it('emergencyWithdraw', async () => {
    await tokenFarm.emergencyWithdrawVela()
  })

  it('poolRewardsPerSec', async () => {
    const poolRewardsPerSec = await tokenFarm.poolRewardsPerSec(false) //vlp pool
    expect(poolRewardsPerSec.rewardsPerSec[0]).eq(rewardPerSec2)
  })

  it('poolRewarders', async () => {
    const poolRewarders = await tokenFarm.poolRewarders(false)
    expect(poolRewarders[0]).eq(complexRewardPerSec2.address)
  })

  it('after expiring the reward Info endtime', async () => {
    expect(await complexRewardPerSec1.currentEndTimestamp(0)).eq(endTimestamp1)
  })

  it('getTier check', async () => {
    const amount_level_one = expandDecimals('5001', 18)
    await vela.approve(tokenFarm.address, amount_level_one)
    await tokenFarm.depositVela(amount_level_one)
    expect(await tokenFarm.getTierVela(wallet.address)).eq((100 - 3) * 1000)
  })

  it('depositVesting', async () => {
    const eVelaBalanceBefore = await eVela.balanceOf(wallet.address)
    const amount = expandDecimals('100', 18)
    await eVela.approve(tokenFarm.address, amount)
    await expect(tokenFarm.withdrawVesting()).to.be.revertedWith('Vester: vested amount is zero')
    await expect(tokenFarm.depositVesting(0)).to.be.revertedWith('Vester: invalid _amount')
    await tokenFarm.depositVesting(amount)
    expect(await tokenFarm.claimable(wallet.address)).eq(0)
    expect(await eVela.balanceOf(wallet.address)).eq(eVelaBalanceBefore.sub(amount))
  })

  it('updateVestingDuration', async () => {
    const vestingDuration = 365 * 24 * 60 * 60
    const maxVestingDuration = 705 * 24 * 60 * 60
    await expect(tokenFarm.updateVestingDuration(maxVestingDuration)).to.be.revertedWith('vesting duration exceeds max')
    await tokenFarm.updateVestingDuration(vestingDuration)
  })

  it('increase time after depositVesting', async () => {
    const passTime = 60 * 60 * 24 * 30 * 12
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('Claim', async () => {
    const passTime = 60 * 60 * 24 * 20
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    await tokenFarm.connect(wallet).claim()
  })

  it('withdrawVesting', async () => {
    const beforeVelaBalance = await vela.balanceOf(wallet.address)
    const vestedAmount = await tokenFarm.getVestedAmount(wallet.address)
    const totalVested = await tokenFarm.getTotalVested(wallet.address)
    expect(await tokenFarm.claimable(wallet.address)).lte(vestedAmount)
    const passTime = 60 * 60 * 24 * 365
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    expect(await tokenFarm.claimable(user0.address)).eq(0)
    const claimableAmount = await tokenFarm.claimable(wallet.address)
    if (claimableAmount.eq(vestedAmount) && totalVested.gte(vestedAmount)) {
      await tokenFarm.withdrawVesting()
      expect(await vela.balanceOf(wallet.address)).eq(beforeVelaBalance.add(vestedAmount))
    }
  })

  // it("deposit with pId = 0, enableLock = true ", async () => {
  //     const amount = expandDecimals('1000', 18)
  //     await expect(tokenFarm.depositVlp(amount))
  //         .to.be.revertedWith("BoringERC20: TransferFrom failed");
  //     await vlp.approve(tokenFarm.address, amount);
  //     await tokenFarm.depositVlp(amount)
  // })

  it('getTimeElapsed 1', async () => {
    const from = 100
    const to = 200
    const endTimestamp = 150
    expect(await complexRewardPerSec1.getTimeElapsed(from, to, endTimestamp)).eq(endTimestamp - from)
  })

  it('getTimeElapsed 2 ', async () => {
    const from = 100
    const to = 150
    const endTimestamp = 200
    expect(await complexRewardPerSec1.getTimeElapsed(from, to, endTimestamp)).eq(endTimestamp - to)
  })

  it('getTimeElapsed 3', async () => {
    const from = 200
    const to = 100
    const endTimestamp = 150
    expect(await complexRewardPerSec1.getTimeElapsed(from, to, endTimestamp)).eq(0)
  })

  it('massUpdatePools', async () => {
    await complexRewardPerSec1.massUpdatePools()
  })

  it('updatePool', async () => {
    const pId = 0
    await complexRewardPerSec1.updatePool(pId)
  })

  // it ("withdraw", async () => {
  //     const amount = expandDecimals('100', 18)
  //     await expect(tokenFarm.withdrawVlpForAccount(wallet.address, amount))
  //         .to.be.revertedWith("didn't pass cooldownDuration")
  // })

  // it ("withdraw after passing cooldown duration", async () => {
  //     const passTime = 60 * 60 * 24 * 365
  //     await ethers.provider.send('evm_increaseTime', [passTime]);
  //     await ethers.provider.send('evm_mine');
  //     const amount = expandDecimals('100', 18)
  //     const beforeBalance = await vlp.balanceOf(wallet.address)
  //     await tokenFarm.withdrawVlpForAccount(wallet.address, amount)
  //     expect(await vlp.balanceOf(wallet.address)).eq(
  //         beforeBalance.add(amount)
  //     )
  //     await ethers.provider.send('evm_increaseTime', [-1 * passTime]);
  // })

  it('depositVesting', async () => {
    const eVelaBalanceBefore = await eVela.balanceOf(tokenFarm.address)
    const amount = expandDecimals('100', 18)
    await eVela.approve(tokenFarm.address, amount)
    await tokenFarm.depositVesting(amount)
    expect(await eVela.balanceOf(tokenFarm.address)).eq(eVelaBalanceBefore.add(amount))
  })

  it('increase time after depositVesting', async () => {
    const passTime = 60 * 60 * 24
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
  })

  it('Set RewardTierInfo', async () => {
    const levels = [
      expandDecimals('1000', 18),
      expandDecimals('5000', 18),
      expandDecimals('10000', 18),
      expandDecimals('25000', 18),
      expandDecimals('50000', 18),
      expandDecimals('100000', 18),
      expandDecimals('250000', 18),
      expandDecimals('500000', 18),
      expandDecimals('1000000', 18),
    ]
    const percents = [
      (100 - 2) * 1000,
      (100 - 3) * 1000,
      (100 - 5) * 1000,
      (100 - 10) * 1000,
      (100 - 15) * 1000,
      (100 - 20) * 1000,
      (100 - 30) * 1000,
      (100 - 40) * 1000,
      (100 - 50) * 1000,
    ]
    await expect(
      tokenFarm.updateRewardTierInfo([expandDecimals('1000', 18)], [(100 - 2) * 1000, (100 - 3) * 1000])
    ).to.be.revertedWith('the length should the same')
    await expect(
      tokenFarm.updateRewardTierInfo(
        [expandDecimals('1500', 18), expandDecimals('1000', 18)],
        [(100 - 2) * 1000, (100 - 3) * 1000]
      )
    ).to.be.revertedWith('levels not sorted')
    await expect(
      tokenFarm.updateRewardTierInfo(
        [expandDecimals('1000', 18), expandDecimals('1500', 18)],
        [120 * 1000, (100 - 3) * 1000]
      )
    ).to.be.revertedWith('percents exceed 100%')
    await tokenFarm.updateRewardTierInfo(levels, percents)
    const tierLevelOne = await tokenFarm.tierLevels(0)
    const tierPercentOne = await tokenFarm.tierPercents(0)
    const tierLevelNine = await tokenFarm.tierLevels(8)
    const tierPercentNine = await tokenFarm.tierPercents(8)
    expect(parseFloat(ethers.utils.formatUnits(tierLevelOne, 18))).eq(1000)
    expect(tierPercentOne.toNumber()).eq(98000)
    expect(parseFloat(ethers.utils.formatUnits(tierLevelNine, 18))).eq(1000000)
    expect(tierPercentNine.toNumber()).eq(50000)
  })

  it('updateCooldownDuration', async () => {
    const cooldownDuration = 1 * 60 * 60
    const maxCooldownDuration = 60 * 60 * 24 * 7 * 5
    await expect(tokenFarm.updateCooldownDuration(maxCooldownDuration)).to.be.revertedWith(
      'cooldown duration exceeds max'
    )
    await tokenFarm.updateCooldownDuration(cooldownDuration)
  })

  it('harvestMany', async () => {
    await tokenFarm.harvestMany(true, true, true)
  })

  it('set', async () => {
    const rewarders = [complexRewardPerSec1.address]
    const maxRewarders = [
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
      complexRewardPerSec1.address,
    ]
    await expect(tokenFarm.setVlpPool(maxRewarders, true)).to.be.revertedWith('set: too many rewarders')
    await expect(tokenFarm.setVlpPool([zeroAddress], true)).to.be.revertedWith('set: rewarder must be contract')
    await tokenFarm.setVelaPool(rewarders, true)
  })

  it('emergencyRewardWithdraw', async () => {
    //await eVela.transfer(complexRewardPerSec1.address, expandDecimals('1000', 18)) //todo: why this is needed
    const amount = expandDecimals('10', 18)
    await eVela.connect(wallet).approve(tokenFarm.address, amount) // eVELA approve
    await tokenFarm.depositEsvela(amount)
    console.log(await eVela.balanceOf(complexRewardPerSec1.address))
    console.log(await complexRewardPerSec1.poolInfo(0))
    console.log(await complexRewardPerSec1.poolInfo(1))
    await expect(complexRewardPerSec1.emergencyRewardWithdraw(0, amount, wallet.address)).to.be.revertedWith(
      'emergency reward withdraw: not enough reward token'
    )
    await complexRewardPerSec1.emergencyWithdraw(0, wallet.address)
  })

  it('ComplexRewardPerSec onVelaReward', async () => {
    const pid = 1
    const user = wallet.address
    const amount = expandDecimals('10', 18)
    await expect(complexRewardPerSec2.onVelaReward(pid, user, amount)).to.be.revertedWith(
      'only Distributor can call this function'
    )
  })

  it('ComplexRewardPerSec addRewardInfo', async () => {
    const currentTimestamp = await getBlockTime(provider)
    const passTime = 60 * 60 * 24 * 30
    await ethers.provider.send('evm_increaseTime', [passTime])
    await ethers.provider.send('evm_mine')
    const pId = 0
    await expect(
      complexRewardPerSec1.addRewardInfo(pId, currentTimestamp + passTime, rewardPerSec1)
    ).to.be.revertedWith('add reward info: reward period ended')
  })

  it('ComplexRewardPerSec addRewardInfo bad new endTimestamp', async () => {
    const currentTimestamp = await getBlockTime(provider)
    const endTimestamp = currentTimestamp + 30 * 60 * 60 * 24
    const rewardPerSec = expandDecimals(3858, 12)
    const pId = 4
    const complexRewardPerSec4 = await deployContract('ComplexRewarderPerSec', [
      eVela.address,
      tokenFarm.address,
      operator.address,
    ])
    const amount = String(ethers.constants.MaxUint256)
    await eVela.connect(wallet).approve(complexRewardPerSec4.address, amount) // VLP approve
    await complexRewardPerSec4.add(pId, currentTimestamp)
    await complexRewardPerSec4.addRewardInfo(pId, endTimestamp, rewardPerSec)
    await expect(complexRewardPerSec4.addRewardInfo(pId, endTimestamp - 60, rewardPerSec)).to.be.revertedWith(
      'add reward info: bad new endTimestamp'
    )
  })
})
