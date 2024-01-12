## main questions

1. Q: What is the deployment order and params

    1. deploy Operators
        - no constructor params
    2. deploy TokenFarm contract
        - defaultVestingDuration
        - eVela address (eNAMI)
        - vela address (NAMI)
        - vlp address (TLP)
        - operator address
    3. deploy PriceManager
        - operator address
    4. deploy Vault
        - operator address, vlp address, vusd address,
    5. deploy LiquidateVault
        - no constructor params
    6. deploy OrderVault
        - no constructor params
    7. deploy PositionVault
        - vault address, priceManager address
    8. deploy Reader (not needed persay, implemented for easy info fetching for protocol)
        - no constructor params
    9. deploy SettingsManager

    - LiquidateVault.address,
    - PositionVault.address,
    - operator.address,
    - vusd.address,
    - tokenFarm.address,

    10. deploy VaultUtils

    - LiquidateVault.address,
    - OrderVault.address,
    - PositionVault.address,
    - priceManager.address,
    - settingsManager.address,

2. Q: What is the user flow for all operations?
    - A: Operations:
        - deposit/withdraw (LP)
            - A:(deposit) call `stake` function in Vault to mint VLP (TLP equivalent). only accepts stablecoins.
            - A:(withdraw) call `unstake` function in Vault to burn tlp in exchange for token, reverts if within cooldown period.
        - orders (create, decrease, cancel)
            - A: first, deposit collateral:
                - call deposit function to mint vusd. only accepts whitellisted tokens from settingsManager `isDeposit` mapping, set via `setEnableDeposit` in SettingsManager, mint 'vusd', Vela's USDG equivalent.
                - burn vusdt in exchange for token back. (same flow as tsunami), can only withdraw whitelisted toknes in `settingsManager.isWithdraw` set in `setEnableWithdraw` in SettingsManager.
            - A: opening positions:
                - user calls `newPositionOrder` from vault. requires VUSD as collateral :)
            - A: adding and/or removing collateral for a position
                - user/position owner calls `addOrRemoveCollateral` from vault
            - A: increasing positions:
                - user calls `createAdddPositionOrder` from vault.
            - A: decreasing positions:
                - user callas `createDecreasePositionOrder` from vault.
                - **_note on creating/increasing/decreasing positions_**
                    - this only creates an order inside `orders` mapping for orderVault, sets order status to 'PENDING', and needs to be executed by keepers (operators).
                    - users can also self close positions if for any reason keepers are down by calling `selfExecuteDecreasePositionOrder` from vault.
        - (that's all the user operations right?)
3. Q: What is the keeper flow for market and limit orders respectively
    - A: limit orders: keeper calls `triggerForOpenOrders` function in OrderVault
        - trigger must be met or else order reverts.
    - A: market orders: keeper calls `executeOpenMarketOrder` fn in PositionVault
        - **_ note_** when orders are created, an event is emitted, keepers would listen for new orders created, if market, execute immediately, if limit, subscribe and execute when passes trigger price.
    - the above is only done to add the order to the queue.. keepers call `executeOrders` function in PositionVault to execute all orders in the queue. if there are issues with the order by the time it gets to this point downstream then it is cancelled.
4. Q: What is the liquidation flow for keepers?

    - keeper calls `liquidatePosition` from LiquidateVault
    - liquidate vault calls `removeUserAlivePosition` in PositionVault, which is called from `liquidatePosition`, inside LiquidateVault.
        - `liquidatePosition` does not need to be called by keepers, but they can be.
        - anyone can call registerLiquidatePosition for a given position when it reaches liquidation threshold, and they lock in a bounty for when this function is called. important to note only the first caller of registerLiquidatePosition is valid.
            - {{{not sure the purpose of this fn i.e. why a user would call this fn over just liquidatePosition directly to claim resolver bounty as well as first caller bounty.}}}
            - for the `liquidatePosition` function, there are two bounties, `firstCallerBounty` and `resolverBounty`. after `registerLiquidationPosition` fn is called, there is a 10 second window for keepers to trigger liquidations. regardless of who fufills the order, the user who successfully executed `registerLiquidatePosition` for a given position will receieve the `firstCallerBounty`. but, only the resolver will receieve the `resolverBounty.` if keepers do not call `liquidatePosition` within 10 seconds of a liquidation register, anyone is open to call liquidatePosition and receieve the `resolverBounty`.

5. Q: What is the flow for creating a new market?

    - PriceManager: setAsset, batchSetAllowedDeviation, batchSetAllowedStaleness, batchSetMaxLeverage,
    - SettingsManager: setTradingFee. setFundingRateFactor, setBorrowFeeFactorPerAssetPerSide

6. Q: What are all the admin flows we need to do one time initially

    - deploying + initializing all contracts. initialization functions establish core protocol state variables (too many to list here), adding reward pools (in vela's case, there is vlp, vela, and esVela reward pools)

7. Q: What are all the admin flows we need to do over time for maintenance
    - executing orders, liquidations, adding/removing collateral, setting referrer tiers (will change depending on how many referrals a user makes etc.), changing state variables (keeper security related, OI monitoring, things as such), banning wallets (if needed), force closing positions (if the position profit > max profit % of totalUSD), whitelisting wallets from cooldown (there is an unstaking cooldown in place for min lockup stakng time for users.)

## personal questions:

1. Q: what are the operational differences between vela and tsunami? Vault, OrderBook, LPs, etc?
    - the general differences betweeen GMX V2 and Vela as far as synthetics goes comes down to how oracle manipulation risk is handled. GMX V2 solves this by isolating each synthetics LP, so if oracle manipulation happens, the max drawdown is limited to the total amount in the specific synthetic LP. Vela's synthetics all pull from the same pool of stablecoins, but there are authoritative (keeper) functions in place, such as disabling an asset from trading, among other things. In the case of Vela, if oracle manipulation happens, it is up to the sole responsibility of the keeper to protect the LP by disabling trading etc. Important to mention other factors such as max funding rate, max OI, etc. these are state variables that if reached prevent trades from occurring. Otherwise the entire LP is at risk of being drained within the scope of these benchmarks. so it is incredibly important to keep these benchmarks under close watch and have keepers keep a close eye on LP security.
    - Vela exchange's TLP equivalent, VLP, only accepts stablecoins in the pool. This is by design and an important thing to note as token weights are not factored in and the pools effectively serve just as liquidity.

## random notes/important things to mention

-   contracts/oracle/FastPriceFeed functionality has been integrated into contracts/core/PriceManager, and is no longer needed.
-   the state variable initializations in test/core/Vault.js are outdated and therefore not correct. they are calling contract functions that do not exist, on multiple occasions. assume this is true across other test files. just something to keep in mind!

-   A:"Operators" are this protocol's keepers. There are multiple levels of authority with different delegating tasks.

        1. normal operator
        2. rewards and fee manager
        3. admin
        4. owner
