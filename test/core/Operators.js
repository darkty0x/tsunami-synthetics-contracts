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

describe('Operators', function () {
  const provider = waffle.provider
  const [owner, user, op0, op1, op2] = provider.getWallets()
  let operator

  beforeEach(async function () {
    operator = await deployContract('Operators', [])

    await operator.setOperator(op1.address, 1)
    await operator.setOperator(op2.address, 2)

    expect(await operator.getOperatorLevel(op0.address)).eq(0)
    expect(await operator.getOperatorLevel(op1.address)).eq(1)
    expect(await operator.getOperatorLevel(op2.address)).eq(2)
  })

  it('non op', async () => {
    // non op cannot set operator level
    expect(operator.connect(op0).setOperator(user.address, 1)).to.be.revertedWith('insufficient level')
  })

  it('level1 op', async () => {
    // level1 op cannot change others operator level
    await expect(operator.connect(op1).setOperator(user.address, 1)).to.be.revertedWith('invalid level')
    await expect(operator.connect(op1).setOperator(user.address, 3)).to.be.revertedWith('invalid level')
    await expect(operator.connect(op1).setOperator(op2.address, 0)).to.be.revertedWith('insufficient level')
  })

  it('level2 op', async () => {
    // level2 op can only change lvl 1 => 0, lvl 0 => 1
    await operator.connect(op2).setOperator(user.address, 1)
    expect(await operator.getOperatorLevel(user.address)).eq(1)
    await operator.connect(op2).setOperator(user.address, 0)
    expect(await operator.getOperatorLevel(user.address)).eq(0)

    await expect(operator.connect(op2).setOperator(user.address, 2)).to.be.revertedWith('invalid level')
    await operator.setOperator(user.address, 1)
    await expect(operator.connect(op2).setOperator(user.address, 2)).to.be.revertedWith('invalid level')
    await expect(operator.connect(op2).setOperator(user.address, 3)).to.be.revertedWith('invalid level')
    await operator.setOperator(user.address, 2)
    await expect(operator.connect(op2).setOperator(user.address, 0)).to.be.revertedWith('insufficient level')
    await expect(operator.connect(op2).setOperator(user.address, 1)).to.be.revertedWith('insufficient level')
    await expect(operator.connect(op2).setOperator(user.address, 2)).to.be.revertedWith('insufficient level')
    await expect(operator.connect(op2).setOperator(user.address, 3)).to.be.revertedWith('insufficient level')
  })

  it('level3 op', async () => {
    expect(await operator.getOperatorLevel(user.address)).eq(0)

    await operator.setOperator(user.address, 1)
    expect(await operator.getOperatorLevel(user.address)).eq(1)

    await operator.setOperator(user.address, 2)
    expect(await operator.getOperatorLevel(user.address)).eq(2)

    await operator.setOperator(user.address, 1)
    expect(await operator.getOperatorLevel(user.address)).eq(1)

    await operator.setOperator(user.address, 0)
    expect(await operator.getOperatorLevel(user.address)).eq(0)

    await operator.setOperator(user.address, 2)
    expect(await operator.getOperatorLevel(user.address)).eq(2)

    await expect(operator.setOperator(user.address, 3)).to.be.revertedWith('invalid level')
  })

  it('transfer ownership', async () => {
    expect(await operator.getOperatorLevel(owner.address)).eq(3)
    expect(await operator.getOperatorLevel(user.address)).eq(0)
    await operator.transferOwnership(user.address)
    expect(await operator.oldOwner()).eq(owner.address)
    expect(await operator.pendingOwner()).eq(user.address)

    await operator.connect(user).acceptOwnership()
    expect(await operator.getOperatorLevel(user.address)).eq(3)
    expect(await operator.getOperatorLevel(owner.address)).eq(0)
  })
})
