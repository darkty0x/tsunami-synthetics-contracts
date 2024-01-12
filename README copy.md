# VELA EXCHANGE

A complete breakdown of our exchange functionality and all contract addresses, functionality and more can be found in our [Gitbook](https://vela-exchange.gitbook.io/vela-knowledge-base/)


## Basic Sample Hardhat Project

This project demonstrates a basic Hardhat use case.
It comes with a sample contract, a test for that contract, a sample script that deploys that contract, and an example of a task implementation, which simply lists the available accounts.
If you are not familiar with hardhat, you can refer it from the link below.
https://hardhat.org/tutorial

Try running some of the following tasks:

```shell
npx hardhat node
npx hardhat clean
npx hardhat compile
npx hardhat test
npx hardhat coverage
npx hardhat run --network network_name scripts/perpetual/network_name/deployFinalScript.js (network name can be arbitrum or arbitrum goerli)
npx hardhat help
```

For formatting the code, you can run it
```
yarn solidity-prettier
```

A complete list of scripts can be found in the scripts folder:

/scripts/arbitrum for Arbitrum Mainnet

/scripts/arbitrum_goerli for Arbitrum Goerli Testnet

## Deployed Contracts
All contracts deployed to Arbitrum Mainnet are detailed at in our [Mainnet Contract Addresses](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-addresses/mainnet)

All contracts deployed to Arbitrum Goerli are detailed at in our [Testnet Contract Addresses](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-addresses/testnet)

| Name                 | Address                                    | Explorer                                                                       |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| vUSDC                | 0xE6a8cb694A34f6bae35c71eAdAda0708E39b255c | https://testnet.arbiscan.io/address/0xE6a8cb694A34f6bae35c71eAdAda0708E39b255c |
| VLP                  | 0x921769Ad30a3Df306f7EAE8078bf426De5Efb618 | https://testnet.arbiscan.io/address/0x921769Ad30a3Df306f7EAE8078bf426De5Efb618 |
| VELA                 | 0x2C38C635fb4469892D503B5819573779C7CD5E60 | https://testnet.arbiscan.io/address/0x2C38C635fb4469892D503B5819573779C7CD5E60 |
| eVELA                | 0x75De0A5EfEe4d08f59FdD6A304Fe1e9bea9bEA95 | https://testnet.arbiscan.io/address/0x75De0A5EfEe4d08f59FdD6A304Fe1e9bea9bEA95 |
| TokenFarm            | 0xE532A6001a81d03A645e0442d8584DB98E5be07a | https://testnet.arbiscan.io/address/0xE532A6001a81d03A645e0442d8584DB98E5be07a |
| Vault                | 0xa6061456cf27E6973D9aa592297bd56894Eb5307 | https://testnet.arbiscan.io/address/0xa6061456cf27E6973D9aa592297bd56894Eb5307 |
| PositionVault        | 0x1dd07152b883c1d0A8490A35121A2e559dFE0702 | https://testnet.arbiscan.io/address/0x1dd07152b883c1d0A8490A35121A2e559dFE0702 |
| VaultUtils           | 0x2CB6f026266F6b9451E559dD7c4BbF1bD0DD2045 | https://testnet.arbiscan.io/address/0x2CB6f026266F6b9451E559dD7c4BbF1bD0DD2045 |
| PriceManager         | 0x2c4478Dd91341Cb50521F2Af7174FB3C73A7DbEC | https://testnet.arbiscan.io/address/0x2c4478Dd91341Cb50521F2Af7174FB3C73A7DbEC |
| SettingsManager      | 0xce12b20F44E8fD27E4cd67eBc5c4F871400f84e7 | https://testnet.arbiscan.io/address/0xce12b20F44E8fD27E4cd67eBc5c4F871400f84e7 |

## Contract Folders

### Access
The access contracts hold constants for configuration used throughout Vela Exchange as well as the Governable contract which sets up ownership and allows the ability to set admin roles and call admin functions. Detailed explanations and code can be found in the [Access Section](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-functions/access).

### Core
The core contracts hold - you guessed it - the core functionality of Vela Exchange. Our vault contract gives traders the ability to deposit, withdraw, open and close positions, and more. Liquidity providers can call functions to stake and unstake stable tokens, thereby minting VLP. Various settings contracts control the settings and configurations for the vault, pricing feeds for assets, and contracts allowing for the opening and triggering of orders. To see code examples and more detail please visit the [Core Section](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-functions/core).

### Oracle
Vela Exchange asset pricing is based on our own FastPriceFeed, which we operate internally. Asset prices are pulled from the latest data sources and published on chain in real time. You can view our [Oracle Section](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-functions/oracle/fastpricefeed) for more information.

### Staking
In addition to staking in our vault to provide liquidity, we provide various staking options for the VELA token, eVELA and more to earn more rewards and get reduced trading fees. You can see the details on our TokenFarm contract in the [Staking Section](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-functions/staking).

### Tokens
The Vela token ecosystem consists of the VELA token as well as our VLP token for liquidity providers, eVELA for vesting VELA tokens over time, and vUSD which is the collateral token for trading. You can see all of our contract info on the various tokens in our [Tokens Section](https://vela-exchange.gitbook.io/vela-knowledge-base/developers/contract-functions/tokens).

## Vault

this is main contract for managing all stakes, unstakes, deposits, withdraws, positions, and orders,

### setVaultSettings
OnlyOwner
Function

this is intialize function for combining relative contracts to Vault
This is called only one time.
```
vault.setVaultSettings(
        IPriceManager _priceManager,
        ISettingsManager _settingsManager,
        IPositionVault _positionVault
    )
```

Example Input

```
('0x2c4478Dd91341Cb50521F2Af7174FB3C73A7DbEC', '0xce12b20F44E8fD27E4cd67eBc5c4F871400f84e7', '0x1dd07152b883c1d0A8490A35121A2e559dFE0702')
```

Example Output
```

```

### deposit

This is a function to deposit USDC for getting vUSD.
Users can open and close positions with vUSD for getting profits via leverage.
So users need to deposit USDC at first time.

```
vault.deposit (
        address _account,
        address _token,
        uint256 _amount
    )
```

Example Input
for depositing 100 USDC(USDC decimals is 6),
```
('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b',
'100000000')
```

Example Output

```

```

### withdraw

This is a function to withdraw USDC from vUSD.
So after using this platform, if you want to withdraw your profits, then you can call this function.

```
vault.withdraw(
        address _token,
        address _account,
        uint256 _amount
    )
```

Example Input
for withdawing 100 vUSD(vUSD decimals is 30),
```
('0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b',  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
'10000000000000000000000000000000')
```

Example Output
```

```

### stake

This is a function to stake USDC for getting VLP.
By staking USDC, you will receive VLP.
Every time fees are generated, vlp price will be increased.
VLP holders will receive rewards from our platform fees.

```
vault.stake(
        address _account,
        address _token,
        uint256 _amount
    )
```

Example Input
for staking 100 USDC(USDC decimals is 6),
```
('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b', '100000000')
```

Example Output

```

```
### unstake

This is a function to unstake VLP for getting rewards.
According to vlp amount and USDC amount(include platform fees), vlp price will be changed.
So, by unstaking VLP at higher price than staking price, user will get the reward.
There is cooldownduration for unstaking VLP.
So users need to wait for cooldownduration before unstaking

```
vault.unstake(
        address _tokenOut,
        uint256 _vlpAmount,
        address _receiver
    )
```

Example Input
for unstaking 100 VLP(VLP decimals is 18),
```
('0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b', '100000000000000000000', '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')
```

Example Output

```

```
### newPositionOrder

This is a function for opening new positions.
You can open new position with market order, limit order, or stop-market order, stop-limit order.

```
vault.newPositionOrder(
        address _indexToken,
        bool _isLong,
        OrderType _orderType,
        uint256[] memory _params,
        address _refer
    )

    (OrderType
        Market Order -> 0,
        Limit Order  -> 1,
        Stop-Market Order -> 2,
        Stop-Limit Order -> 3
    )
    for all orders, _params[2] -> collateral, _params[3] -> position size amount
    In Market Order's case, _params[0] -> mark price, _params[1] -> slippage percent,
    In Limit Order's case, _params[0] -> limit price
    In Stop-Market Order's case, _params[1] -> stop price,
    In Stop-Limit Order's case, _params[0] -> limit price, _params[1] -> stop price
```

Example Input
if you want to open BTC Long position for market order at 19,172(we allow slippage 1%, we use percentage basis points 100000, so it is 1000, means 100% * 1000/100000 = 1%),
collateral 10, position size 100, so the leverage 10
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 0, ['19172000000000000000000000000000000', '1000', '10000000000000000000000000000000', '100000000000000000000000000000000'], '0x000')
```

if you want to open BTC Short position for market order at 19,172(we allow slippage 1%, we use percentage basis points 100000, so it is 1000, means 100% * 1000/100000 = 1%),
collateral 10, position size 100, so the leverage 10
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', false, 0, ['19172000000000000000000000000000000', '1000', '10000000000000000000000000000000', '100000000000000000000000000000000'], '0x000')
```

if you want to open BTC Long position for limit order at 19,372,
collateral 10, position size 100, so the leverage 10
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 1, ['19372000000000000000000000000000000', '0', '10000000000000000000000000000000', '100000000000000000000000000000000'], '0x000')
```

if you want to open BTC Long position for stop-market order at 19,202,
collateral 10, position size 100, so the leverage 10
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 2, ['0', '19202000000000000000000000000000000', '10000000000000000000000000000000', '100000000000000000000000000000000'], '0x000')
```

if you want to open BTC Long position for stop-limit order at limit 19,372, and stop price 19,202
collateral 10, position size 100, so the leverage 10
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 3, ['19372000000000000000000000000000000', '19202000000000000000000000000000000', '10000000000000000000000000000000', '100000000000000000000000000000000'], '0x000')
```
Example Output

```

```

### decreasePosition

This is a function for decreasing or closing existing positions.
there is close delay time for decreasing position.
so users need to wait close delay time(default, it is 1 hour)
```
vault.decreasePosition(
        address _indexToken,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
for decreasing position size 100,
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', '10000000000000000000000000000000', true, '0')
```

Example Output

```

```

### cancelPendingOrder

This is a function for cancelling user's open pending orders.
```
vault.cancelPendingOrder(
        address _indexToken,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
if your first position is for BTC Long Position with limit order, and it is still in pending, then you can cancel it.
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0')
```

Example Output

```

```

### addOrRemoveCollateral

This is a function for adding or removing user's collateral.
so this will affect user's leverage
```
vault.addOrRemoveCollateral(
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        bool isPlus,
        uint256 _amount
    )

    if you wanna add collateral, then you can set isPlus as true, for removing collateral, set isPlus as false
```

Example Input
If you wanna add collateral 10, then
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0', true, '10000000000000000000000000000000')
```

If you wanna remove collateral 10, then
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0', false, '10000000000000000000000000000000')
```

### addPosition

This is a function for adding to your existing position.
it keeps the same leverage, this will affect your profits
for preventing front-runners, we are putting confirmDelay time. it will be added after the delay time
```
vault.addPosition(
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        uint256 _collateralDelta,
        uint256 _sizeDelta
    )
```

Example Input
If you wanna add collateral 10, position size 100, then
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0', '10000000000000000000000000000000', '100000000000000000000000000000000')
```

Example Output

```

```

### add trailing stop
Users can add trailing stop to existing positions.

```
vault.addTrailingStop(
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        uint256[] memory _params
    )

    _params[0] -> the collateral amount what you are going to add trailing stop for
    _params[1] -> the position size what you are going to add trailing stop for
    _params[2] -> trailing step type, so trailing step type = 0 means 'by price', type = 1 means 'by percent'
    _params[3] -> step size
```

Example Input
if you wanna add trailing stop by price change(so you want to take trail stop order when the last price exceeds 1$ change)
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0',
[
    '10000000000000000000000000000000',
    '100000000000000000000000000000000',
    0,
    '1000000000000000000000000000000'
])
```

if you wanna add trailing stop by percent change(so you want to take trail stop order when the last price exceeds 2% change)
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0',
[
    '10000000000000000000000000000000',
    '100000000000000000000000000000000',
    1,
    '2000'
])
```

Example Output

```

```

### transferBounty
Function

This is a function to transfer bounty to users who executed liquidatePosition.
This function can be called only be Vault.
```
vaultUtils.transferBounty(
        address _account,
        uint256 _amount
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
 '1000000000000000000000000')
```

Example Output

```
```

### getVLPPrice
This is a function for getting VLP Price
it is based on BASIS_POINTS 100000.
So if you get 124500, then it means vlp price is 124500/100000=1.245$

```
vault.getVLPPrice()
```

Example Input
```
```
Example Output

```
100000
```

## PositionVault

this is main contract for managing all positions, and orders,

### getPosition
This is a function for fetching user's position info

```
positionVault.getPosition(
        uint256 _posId
    )
```

Example Input
```
(
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec',
    true,
    '0'
)
```
Example Output

```
[
    {
        owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        refer: '0x0000000000000000000000000000000000000000',
        realisedPnl: 0,
        averagePrice: '191200000000000000000000000000000',
        collateral: '10000000000000000000000000000',
        entryFundingRate: 0,
        lastIncreasedTime: 1674526212,
        lastPrice: 171200000000000000000000000000000,
        reserveAmount: 1008000000000000000000000000,
        size: 100000000000000000000000000000
    },
    {
        2,
        status: 2,
        lmtPrice: 0,
        size: 0,
        collateral: 0,
        positionType: 0,
        stepAmount: 0,
        stepType: 0,
        stpPrice: 0
    },
    {
        confirmDelayStatus: false,
        pendingDelayCollateral: 10000000000000000000000000000,
        pendingDelaySize: 100000000000000000000000000000,
        delayStartTime: 1674529815
    }
]
```

### liquidatePosition

This is a function for liquidating user's position on that case when user's loss exceeds user's original collateral.
users can participate for liquidating any position for getting bounty.
before our server liquidating any position, the user will receive the bounty.
```
positionVault.liquidatePosition(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', '10000000000000000000000000000000', true, '0')
```

Example Output

```

```

### triggerPosition

This is a function for executing user's TP or SL, or pending orders(limit order, stop-market order, stop limit order or trailing-stop).
This function can be called by position owner or platform position manager
```
positionVault.triggerPosition(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0')
```

Example Output
```
```

### updateTrailingStop
This is a function for updating user's trailing stop order data.
according to price change, the user trailing stop price will be changed.
So for Long position, if the price rises, the the trailing stop price also rise
This function can be called by position owner or platform position manager
```
positionVault.updateTrailingStop(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0')
```

Example Output

```

```

## OrderVault

This is a contract for updating user's TP or SL trigger orders

### updateTriggerOrders

This is a function for adding or updating User's TP or SL orders.
```
OrderVault.updateTriggerOrders(
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        uint256[] memory _tpPrices,
        uint256[] memory _slPrices,
        uint256[] memory _tpAmountPercents,
        uint256[] memory _slAmountPercents,
        uint256[] memory _tpTriggeredAmounts,
        uint256[] memory _slTriggeredAmounts
    )
```

Example Input
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0',
    [
        '5750000000000000000000000000000000000',
        '5820000000000000000000000000000000000',
        '5900000000000000000000000000000000000'
    ],
    [
        50000,
        30000,
        20000
    ],
    [
        0,
        0,
        0
    ],
    [
        '5400000000000000000000000000000000000'
    ]
    [
        100000
    ]
    [
        0
    ]
)
```

Example Output

```

```

### cancelTriggerOrders

This is a function for cancelling User's TP or SL orders.
```
OrderVault.cancelTriggerOrders(
        address _token,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0')
```

Example Output

```
```

### getTriggerOrderInfo

This is a function for cancelling User's TP or SL orders.
```
OrderVault.getTriggerOrderInfo(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0')
```

Example Output
```
triggerOrderInfo:  [
  key: '0x8a7ab2cdf5d3b138b3576addd7d3a9765c360b076d02467901a09ac8c1d2dcde',
  slPrices: ['5400000000000000000000000000000000000'],
  slAmountPercents: [100000],
  slTriggeredAmounts: [0],
  tpPrices: ['5750000000000000000000000000000000000', 820000000000000000000000000000000000', '5900000000000000000000000000000000000'],
  tpAmountPercents: [50000, 30000, 20000],
  tpTriggeredAmounts: [0, 0, 0],
  status: 0 // 0 -> Open, 1 - Triggered, 2 - Cancelled
]
```

### validateTPSLTriggers

This is a function for checking user's TP or SL triggerable status to excute user's TP or SL.
```
OrderVault.validateTPSLTriggers(
        address _account,
        address _token,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '0')
```

Example Output
```
true  // if it is triggerable, true
```


## VaultUtils

This is a  contract for helping Vault

### validateDecreasePosition
Function

This is a function for checking decreasePosition, so if it is available to execute decreasePosition, then it returns true.
for example, the user are going to execute more size than the position size the user opened, then it will revert that and return false.
```
vaultUtils.validateDecreasePosition(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        bool _raise
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, false)
```

Example Output

```
false
```

### validateLiquidation
Function

This is a function for checking liquidatePosition, so if it is available to execute liquidatePosition, then it returns true.
for example, the user are going to liquidate any position which is not hitted liquidate condition, then it will revert that.
```
vaultUtils.validateLiquidation(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        bool _raise
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, false)
```

Example Output

```
false
```

### validatePosData
Function

This is a function for checking user position input data.
if user doesn't input the data correctly, then it will revert that.
```
vaultUtils.validatePosData(
        bool _isLong,
        address _indexToken,
        OrderType _orderType,
        uint256[] memory _triggerPrices,
        bool _raise
    )
```

Example Input
```
(true, '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', 0, ['19172000000000000000000000000000000', '1000', '10000000000000000000000000000000', '100000000000000000000000000000000'], false)
```

Example Output

```
false
```


### validateTrailingStopInputData
Function

This is a function for checking user trailing stop input data.
if user doesn't input the data correctly, then it will revert that.
```
vaultUtils.validateTrailingStopInputData(
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        uint256[] memory _triggerPrices
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 0, [
    '10000000000000000000000000000000',
    '100000000000000000000000000000000',
    0,
    '1000000000000000000000000000000'
])
```

Example Output

```
false
```

### validateTrailingStopPrice
Function

This is a function to check whether a user's trailing stop price can be updated or not.
```
vaultUtils.validateTrailingStopPrice(
        address _indexToken,
        bool _isLong,
        uint256 _posId,
        bool _raise
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 0, false)
```

Example Output

```
false
```

### validateTrigger
Function

This is a function to check whether trigger can be executed or not.
```
vaultUtils.validateTrigger(
        address _indexToken,
        bool _isLong,
        uint256 _posId
    )
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 0)
```

Example Output

```
false
```

### validateSizeCollateralAmount
Function

This is a function to check whether position size is bigger than collateral
system supports only leverage 1.x+
So if position size is smaller than collateral, then it returns false.
```
vaultUtils.validateSizeCollateralAmount(
        uint256 _size,
        uint256 _collateral
    )
```

Example Input
```
('100', '10')
```

Example Output

```
false
```

## SettingsManager

This is a contract for Vault Settings
This is the contract for owner.
### setFeeManager
Owner Function

This is an owner function for setting feeManager address.
```
settingsManager.
    setFeeManager(address _feeManager)
```

Example Input
```
('0x70997970c51812dc3a010c7d01b50e0d17dc79c8')
```

Example Output
```
```

### setVaultSettings
Owner Function

This is an owner function for setting cooldownduration and fee rewards basis points.
```
settingsManager.setVaultSettings(
        uint256 _cooldownDuration,
        uint256 _feeRewardsBasisPoints
    )
```

Example Input
```
(
    '0',  // no cooldownduration
    '70000' // 70%
)
```

Example Output
```
true
```

### delegate
User Function

This is a function for adding delegates who can participate for StakeFor or DepositFor specific user.
```
settingsManager.delegate(address[] memory _delegates)
```

Example Input
```
[
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
]
```

Example Output
```
```

### enableMarketOrder
Owner Function

This is a function for enable or disable market Order
```
settingsManager.enableMarketOrder(bool _enable)
```

Example Input
```
(
    true // enable market order
)
```

Example Output
```
```

### pauseForexMarket
assetManagerWallet Function

This is a function for enable or disable forex trade at forex close time
```
settingsManager.pauseForexMarket(bool _enable)
```

Example Input
```
(
    true // pause forex trade
)
```

Example Output
```
```

### setAssetManagerWallet
Owner Function

This is a function to set asset manager wallet
```
settingsManager.setAssetManagerWallet(address _wallet)
```

Example Input
```
(
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' //
)
```

Example Output
```
```

### setCloseDeltaTime
Owner Function

This is a function for setting closeDelta time
```
settingsManager.setCloseDeltaTime(uint256 _deltaTime)
```

Example Input
```
(
    0 // users can close his position without waiting any closeDelaTime
)
```

Example Output
```
```

### setDepositFee
Owner Function

This is an owner function for setting deposit fee.
```
settingsManager.setDepositFee(uint256 _fee)
```

Example Input
```
(
    0, // we dont charge any fee for deposit or withdraw.
)
```

Example Output
```
```

### setEnableDeposit
Owner Function

This is an owner function for enable deposit or withdraw for token.
```
settingsManager.setEnableDeposit(
        address _token,
        bool _isEnabled
    )
```

Example Input
```
(
    '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b',
    true // we allow users to deposit or withdraw only USDC
)
```

Example Output
```
```

### setEnableStaking
Owner Function

This is an owner function for enable stake or unstake for token.
```
settingsManager.setEnableStaking(
        address _token,
        bool _isEnabled
    )
```

Example Input
```
(
    '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b',
    true // we allow users to stake or unstake only USDC for VLP
)
```

Example Output
```
```

### setFundingRateFactor
Owner Function

This is an owner function to set funding rate factor based on asset and side
```
settingsManager.setFundingRateFactor(
        address _token,
        uint256 _fundingRateFactor
    )
```

Example Input
```
(
    '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', 100 // set BTC Long funding rate
)
```

Example Output
```
```

### setLiquidateThreshold
Owner Function

This is an owner function to set liquidateThrehold
```
settingsManager.setLiquidateThreshold(
        uint256 _newThreshold,
        address _token
    )
```

Example Input
```
(
    9900, '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', // set 99% for liquidateThreshold
)
```

Example Output
```
```

### setLiquidationFeeUsd
Owner Function

This is an owner function to set liquidationFee
```
settingsManager.setLiquidationFeeUsd(uint256 _liquidationFeeUsd)
```

Example Input
```
(
   0, // we dont charge any fee for liquidation
)
```

Example Output
```
```

### setMarginFeeBasisPoints
Owner Function

This is an owner function to set margin fee basis points based on asset and side
This is used for position fee
```
settingsManager.setMarginFeeBasisPoints(
        address _token,
        bool _isLong,
        uint256 _marginFeeBasisPoints
    )
```

Example Input
```
(
    '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, 100 // set BTC Long margin fee basis points
)
```

Example Output
```
```

### setMaxBorrowAmountPerAsset
Owner Function

This is an owner function to set max borrow amount per asset
```
settingsManager.setMaxBorrowAmountPerAsset(
        address _token,
        uint256 _maxAmount
    )
```

Example Input
```
(
    '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', '10000000000000000000000000000000000'// set 10000 for BTC
)
```

Example Output
```
```

### setMaxBorrowAmountPerSide
Owner Function

This is an owner function to set max borrow amount per side
```
settingsManager.setMaxBorrowAmountPerSide(
        bool _isLong,
        uint256 _maxAmount
    )
```

Example Input
```
(
    true, '10000000000000000000000000000000000'// set 10000 for LONG
)
```

Example Output
```
```

### setMaxBorrowAmountPerUser
Owner Function

This is an owner function to set max borrow amount per user
```
settingsManager.setMaxBorrowAmountPerUser(uint256 _maxAmount)
```

Example Input
```
(
    '10000000000000000000000000000000000'// set 10000 for each user
)
```

Example Output
```
```

### setPositionManager
Owner Function

This is an owner function to set position manager address
```
settingsManager.setPositionManager(
        address _manager,
        bool _isManager
    )
```

Example Input
```
(
    '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b', true //
)
```

Example Output
```
```

### setReferEnabled
Owner Function

This is an owner function to enable or disable refer feature
```
settingsManager.setReferEnabled(bool _referEnabled)
```

Example Input
```
(
    true
)
```

Example Output
```
```

### setReferFee
Owner Function

This is an owner function to set refer fee
```
settingsManager.setReferFee(uint256 _fee)
```

Example Input
```
(
    '10000000000000000000000000000000' // set 10 usd for refer
)
```

Example Output
```
```

### setStakingFee
Owner Function

This is an owner function for setting staking fee.
```
settingsManager.setStakingFee(uint256 _fee)
```

Example Input
```
(
    0, // we dont charge any fee for stake or unstake.
)
```

Example Output
```
```

### setBountyPercent
Owner Function

This is an owner function to set bountyPercent for transfer Bounty.
```
settingsManager.setBountyPercent(uint256 _bountyPercent)
```

Example Input
```
(
    20000, // we transfer 20% fee for bounty.
)
```

Example Output
```
```


### validatePosition
Function

This is a function to check max leverage exceed status or max borrow amount exceed status for position
if it exceeds the max leverage or max borrow amount, then it will revert
```
vaultUtils.validatePosition(
        address _account,
        address _indexToken,
        bool _isLong,
        uint256 _size,
        uint256 _collateral
    )
```

Example Input
```
('0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '100', '10')
```

Example Output

```
```


### checkDelegation
Function

This is a function to check delegate's allow status for stakeFor or depositFor
```
vaultUtils.checkDelegation(
        address _master,
        address _delegate
    )
```

Example Input
```
('0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b', '0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec')
```

Example Output

```
true
```


### getFundingFee
Function

This is a function to get funding fee
```
vaultUtils.getFundingFee(
        address _indexToken,
        bool _isLong,
        uint256 _size,
        uint256 _entryFundingRate
    )
```

Example Input
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '100', '256')
```

Example Output

```
1800000000000000000000000000// 0.00018 usd
```

### getPositionFee
Function

This is a function to get position fee
```
vaultUtils.getPositionFee(
        address _indexToken,
        bool _isLong,
        uint256 _sizeDelta
    )
```

Example Input
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec', true, '100')
```

Example Output

```
1800000000000000000000000000// 0.00018 usd
```

### getDelegates
Function

This is a function to get all delegates for stakeFor and depositFor
```
vaultUtils.getDelegates(
        address _master
    )
```

Example Input
```
('0xa36F5ea837A1925252eB5dc5A3605C9C3ba840ec')
```

Example Output

```
['0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b']
```

## ComplexRewarder

This is the reward contract for simple stake token.
### add
Owner Function

This is an owner function for creating new pool Info.
```
complexRewarder.
    add(uint256 _pid, uint256 _startTimestamp)
```

Example Input
```
('0', 1674529815) // pId = 0, startTimestamp = 1674529815 2023-02-01: 09:30:00
```

Example Output
```
```

### addRewardInfo
Owner Function

This is an owner function for adding new reward to the created pool.
```
complexRewarder.addRewardInfo(
        uint256 _pid,
        uint256 _endTimestamp,
        uint256 _rewardPerSec
    )
```

Example Input
```
('0', 1675529815, 10000000000000000) // pId = 0, endTimestamp = 1674529815 2023-03-01: 09:30:00 provide 0.02 reward token per sec until 2023-03-01
```

Example Output
```
```

### currentEndTimestamp
Function

This is a function to get the endTimestamp of the pool.
```
complexRewarder.currentEndTimestamp(uint256 _pid)
```

Example Input
```
('0') // pId = 0
```

Example Output
```
1675529815
```

### pendingTokens
Function

This is a function to get pending reward tokens amount of the pool.
```
complexRewarder.pendingTokens(
        uint256 _pid,
        address _user
    )
```

Example Input
```
('0', '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b') // pId = 0
```

Example Output
```
15634388888
```

### poolRewardsPerSec
Function

This is a function to get reward per sec of the pool.
```
complexRewarder.poolRewardsPerSec(
        uint256 _pid
    )
```

Example Input
```
('0') // pId = 0
```

Example Output
```
10000000000000000 // 0.02 per sec
```

## TokenFarm

This is the contract for staking and vesting.
### add
Owner Function

This is an owner function to create new pool Info for multi-rewarders.
for specific pool, we can set cooldownduration, so before passing cooldown duration, nobody can withdraw their staked token.
```
tokenFarm.
    add(
        IBoringERC20 _lpToken,
        IComplexRewarder[] calldata _rewarders,
        bool _enableCooldown
    )
```

Example Input
```
    (
        '0x020F88c59222241378B23325fdCFEc4ea3fF5199',
        [
            '0x1fd018999420dAb0f98032e8831C0A735f55EDd0',
            '0x22B1E7E25ce22251DAf656B7c85b0fcc16d8aF8D'
        ],
        true
    ) // we give vela and eVela as rewards for VLP stakers. we enable cooldownDuration.
```

Example Output
```
```

### deposit
Function

This is a function for deposting stake token.
```
tokenFarm.deposit(uint256 _pid, uint256 _amount)
```

Example Input
```
('0', 10000000000000000000) // stake 10 VLP
```

Example Output
```
```

### updateCooldownDuration
Owner Function

This is a function for update cooldown duration.
```
tokenFarm.updateCooldownDuration(
        uint256 _newCooldownDuration
    )
```

Example Input
```
0 // no cooldown duration
```

Example Output
```
```

### withdraw
Function

This is a function for withdraw with reward token.
```
tokenFarm.withdraw(
        uint256 _pid,
        uint256 _amount
    )
```

Example Input
```
('0', 10000000000000000000) // unstake 10 VLP
```

Example Output
```
```

### emergencyWithdraw
Function

This is a function for withdraw full amount of staked token without reward token.
```
tokenFarm.emergencyWithdraw(uint256 _pid)
```

Example Input
```
('0') //
```

Example Output
```
```

### pendingTokens
Function

This is a function to get pending multi reward tokens amount of the pool.
```
tokenFarm.pendingTokens(
        uint256 _pid,
        address _user
    )
```

Example Input
```
('0', '0x93F2394ceA60fa9E2E9AC215cd8ba04c30ed103b') // pId = 0
```

Example Output
```
{
  addresses: [ '0x0aD6371dd7E9923d9968D63Eb8B9858c700abD9d' ],
  symbols: [ 'esVELA' ],
  decimals: [ 18 ],
  amounts: [ '125600000000000000000' ]
}
```

### poolLength
Function

This is a function to get the length of pool.
```
tokenFarm.poolLength()
```

Example Input
```
```

Example Output
```
3
```

### poolRewarders
Function

This is a function to get reward tokens address of the pool.
```
tokenFarm.poolRewarders(
        uint256 _pid
    )
```

Example Input
```
('0') // pId = 0
```

Example Output
```
  [ '0x0aD6371dd7E9923d9968D63Eb8B9858c700abD9d' ]
```

### poolRewardsPerSec
Function

This is a function to get rewards per second of the pool.
```
tokenFarm.poolRewardsPerSec(
        uint256 _pid
    )
```

Example Input
```
('0') // pId = 0
```

Example Output
```
{
  addresses: [ '0x0aD6371dd7E9923d9968D63Eb8B9858c700abD9d' ],
  symbols: [ 'esVELA' ],
  decimals: [ 18 ],
  rewardsPerSec: [ '10000000000000000' ]
}
```

### poolTotalLp
Function

This is a function to get total LP of the pool.
```
tokenFarm.poolTotalLp(uint256 pid)
```

Example Input
```
('0') // pId = 0
```

Example Output
```
  '15643200000000000000000'
```

### depositVesting
Function

This is a function for deposting vest token
```
tokenFarm.depositVesting(uint256 _amount)
```

Example Input
```
(10000000000000000000) // stake 10 eVELA
```

Example Output
```
```

### updateVestingDuration
Owner Function

This is an owner function to update vesting duration
```
    tokenFarm.updateVestingDuration(
        uint256 _vestingDuration
    )
```

Example Input
```
60 * 60 * 24* 365 // set 365 days for vesting duration
```

Example Output
```
```

### claimable
Function

This is a function to get claimable token amount from vesting
```
    tokenFarm.claimable(address _account)
```

Example Input
```
('0x0aD6371dd7E9923d9968D63Eb8B9858c700abD9d')
```

Example Output
```
  '15643200000000000000000'
```


### getVestedAmount
Function

This is a function to get vested token amount
```
    tokenFarm.getVestedAmount(address _account)
```

Example Input
```
('0x0aD6371dd7E9923d9968D63Eb8B9858c700abD9d')
```

Example Output
```
  '15643200000000000000000'
```

### withdrawVesting
Owner Function

This is an owner function to withdraw token from vesting.
```
tokenFarm.withdrawVesting()
```

Example Input
```
```

Example Output
```
```
