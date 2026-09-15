# Graduation, revenue and event integration

Checked: **2026-09-15**. Verified package: **`@masterpeach/launchpad-sdk@1.0.0`**. Contract behavior is drawn from the public feature guides; no live graduation, claim or recovery transaction was performed.

Sources: [graduation](https://docs.peach.ag/documentation/arc/launchpad/core-features/graduation), [fees and Holder claims](https://docs.peach.ag/documentation/arc/launchpad/core-features/fees-and-claims), [Partners](https://docs.peach.ag/documentation/arc/launchpad/core-features/partners), [buyback and vesting](https://docs.peach.ag/documentation/arc/launchpad/core-features/buyback-and-vesting), [emergency exit](https://docs.peach.ag/documentation/arc/launchpad/core-features/emergency-exit), [events and indexing](https://docs.peach.ag/documentation/arc/launchpad/core-features/events-and-indexing).

Read only the sections relevant to the integration, with [network and contract identity](networks-and-contracts.md). For feature-specific acceptance checks use the [official integration checklist](https://docs.peach.ag/documentation/arc/launchpad/core-features/integration-checklist).

## Lifecycle and trading destination

| Contract status / SDK status | Condition | Application behavior |
| --- | --- | --- |
| `0` / `notGraduated` | `graduationReady` is false | Curve trading can be offered after current state/quote checks |
| `0` / `notGraduated` | `graduationReady` is true | Curve trading is closed; complete/wait for sweep |
| `1` / `swept` | Assets moved to GraduationExecutor | Pool is not ready; complete/wait for pool creation |
| `2` / `poolCreated` | V4 liquidity created | Curve stays closed; verify the official pool and routing availability |
| `3` / `emergencyExited` | Recovery activated | Follow the active EmergencyDistributor redemption flow |

`graduationReady` is a curve flag, not a fifth status. Use `client.getTokenState(token, { blockNumber })` or `getGraduation` to refresh state. A boundary buy attempts the first step automatically; `AutoGraduationFailed` can accompany a successful buy or creation. Do not retry the purchase just because graduation failed.

If the application offers completion actions:

1. For `notGraduated` plus readiness, use `prepareGraduate(token)`; its public contract entry is **Factory `graduate(token)`**, permissionless and with no user token approval.
2. For freshly read `swept`, use `prepareCreateGraduatedPool(token)`; the public entry is **Factory `createGraduatedPool(token)`**, a separate permissionless transaction with no user token approval.
3. Confirm each receipt and re-read state. Another caller can complete a step first. `launchpadGraduateIsIdempotentSuccess(refreshedStatus)` helps classify a completed first step; do not swallow a failed receipt without establishing the new state.

If pool creation fails, assets remain in the executor and the status stays `swept`. A transaction timeout requires receipt/state reconciliation, not blind resubmission. `getPoolId(token)` returns zero before pool creation; a nonzero ID alone is not evidence of an available Aggregator route.

### After graduation

- Resolve `MemeHook.poolForToken(token)` and `poolConfig(poolId)` at a consistent block. Verify the active official PoolKey, currencies, fee, tick spacing, Hook and calculated poolId against the deployment.
- **Mainnet:** use this repository's `arc-aggregator` skill when available, or the [official Aggregator guide](https://docs.peach.ag/documentation/arc/aggregator/overview), with the Mainnet API. A pool may need time to be indexed; `5010` can be a transition state. Do not force curve-only routing.
- **Testnet:** use the official [V4 pool structure](https://docs.peach.ag/documentation/arc/launchpad/core-features/uniswap-v4-hooks/overview-and-pool-structure) and [V4 trading integration](https://docs.peach.ag/documentation/arc/launchpad/core-features/uniswap-v4-hooks/trading-integration) guides with Testnet contracts. Do not call the Mainnet Aggregator for a Testnet token.
- The documented V4 Test Swap Router is a test helper, not a production routing recommendation. Hook callbacks are invoked by PoolManager. Do not copy Testnet Permit2 into Mainnet or into Aggregator delegated execution.

## FeeEscrow and Partner claims

Pending fees on curves/Hooks and claimable balances in FeeEscrow are different states. Query `getPendingFees(curve)` separately from `getClaimableBalance({ recipient, asset })`. FeeEscrow balances are keyed by **recipient and asset**, not by launch; shared recipients aggregate balances. Reconstruct per-launch attribution from events if needed.

| Action | SDK / contract | Permission and outcome |
| --- | --- | --- |
| Recipient claim | `prepareClaim({ asset, amount? })` / `claimToken(asset[, amount])` | Connected recipient claims its own credited balance; omit amount for all; no token approval |
| Partner balance | `getPartnerClaimableBalance({ partnerId, asset })` / `partnerBalance` | Separate from the recipient ledger |
| Partner claim | `preparePartnerClaim({ partnerId, asset })` / `claimPartner` | Current registered recipient and enabled Partner required; no token approval |

Curve base fees, snipe tax, Creator Tax, Hook fees and Partner allocation are distinct. Read current/frozen applicable policy rather than hard-coding a headline percentage. Successful V4 fee settlement can be partial: unconverted funds remain pending. Re-read claimable balances after receipts instead of promoting all pending fees to withdrawable funds.

For attribution, `getPartnerUsability(partnerId)` distinguishes usable from earning. Zero bytes32 means no Partner. Unknown nonzero IDs revert the trade; registered disabled Partners remain usable but earn nothing. Disabling a Partner freezes claims without erasing balances; a recipient change transfers access to the unclaimed ledger. Curve trades accept a checked `partnerId`; V4 uses `encodeLaunchpadPartnerHookData`. Do not assume the Aggregator exposes either as a custom request field.

Keeper fee sweeps have role-specific permissions; they are not ordinary wallet claims. Read [Hook settlement](https://docs.peach.ag/documentation/arc/launchpad/core-features/uniswap-v4-hooks/fee-settlement-and-state) only when integrating that workflow. Curve `sweepFees` requires the configured fee-sweep operator and a meaningful buyback minimum; a sweep can also advance graduation.

## Holder claims

The Proof API is an application integration boundary; this skill does not invent its URL or provide a proof service. The SDK validates Merkle allocations and prepares contract calls.

1. Resolve `getHolderDistributor(token)` / `getLaunchpadHolderBinding` and verify registration, token/quote bindings and deployment. Do not trust an arbitrary distributor supplied in a proof response.
2. Validate the response and construct `LaunchpadHolderAllocation`. Use `BigInt(response.onchain_epoch_id)`, **not the service's database epoch ID**. Keep raw `quoteAmount` and `coinAmount` as `bigint`, and validate account and proof. Either amount can be zero, but not both.
3. At one block, read distributor state and epoch: ensure the epoch exists, is neither expired nor rolled over, the account is not excluded, and it has not already claimed. Validate the allocation with `launchpadHolderAllocationMatchesRoot(allocation, epoch.root)`.
4. Use `prepareHolderClaim({ distributor, allocation })`; anyone can supply gas, but payment goes to **`allocation.account`**. No spending approval is required. Batch claims use one distributor; one invalid allocation reverts the batch.
5. Confirm the receipt and refresh claim status. Keep allocation/distributor unchanged between validation and preparation; simulation and the receipt resolve races.

`prepareHolderHarvest` collects available revenue and vested launch tokens into the distributor, not into holder wallets. Harvest does not publish an epoch. Harvest and ready epoch rollover are permissionless; epoch publishing belongs to its authorized publisher. Holder payouts require a published epoch and proofs.

## Buyback and vesting

Use `getBuybackVest(token)` and `getBuybackReleasable(token)`. Only the vest's recorded creator or protocol recipient can trigger `prepareBuybackRelease(token)` / `BuybackVault.release(token)`. Release credits both shares into FeeEscrow; each recipient then claims the launch-token asset separately.

Deposits share a weighted five-year schedule; new deposits can extend the remaining vesting end. Read current state rather than assuming a fixed unlock date from the first deposit. Current fee-recipient rights govern buyback toggles/recipient transfer; the original creator does not retain those rights after a transfer. For Holder sharing, vested tokens can be harvested into a later Holder epoch instead of paid immediately to holders.

## Emergency redemption

The seven-day delay starts at `sweptAt`, but elapsed time alone does not activate redemption. **Only the Factory Owner can trigger Emergency Exit.** A user-facing recovery integration must wait for `emergencyExited`, a deployed distributor and `activated === true`.

Resolve `getEmergencyDistributor({ launchToken, quoteToken })`, read `getEmergencyExitState(distributor)`, then approve the **launch token to that EmergencyDistributor** before `prepareEmergencyRedeem({ distributor, tokenIn })`. Confirm allowance and re-preview before preparation/submission. Redemption burns the supplied launch tokens and pays quote assets according to current supply; the final redeemer receives the remaining balance.

The redemption contract has **no minimum-output argument**. Present the quote as an estimate and show the confirmed payout; do not invent slippage protection or promise a fixed recovery amount. EmergencyDistributor is separate from HolderDistributor.

## Event sources and reconciliation

Route by **`log.address` before selecting the ABI**. Shared event names/topics do not establish the emitter.

| Emitter | What to index |
| --- | --- |
| Factory | `TokenCreated`, current Forwarder and revenue/configuration updates |
| Each BondingCurve | `CurveTrade`, fee/tax/sweep/buyback events; possible `AutoGraduationFailed` |
| GraduationCoordinator | `GraduationSwept`, `PoolGraduated`, `EmergencyExited` |
| MemeHook | Official pool activation and post-graduation fee events |
| FeeEscrow | Recipient and Partner credits/claims as distinct ledgers |
| Holder-aware Forwarder + Holder factory | `HolderSharingLaunchCreated` + `DistributorCreated`, reconciled with Factory `TokenCreated` |
| Each HolderDistributor | Harvest, epoch publication, claim and rollover |
| Each EmergencyDistributor | Activation and redemption |

For curve fills, `grossQuoteBasisRaw` is gross quote volume; `quoteSpentOrReceivedRaw` is actual payer/recipient cash flow. On buys, account for closing refunds. On sells, the ABI field `tokenRecipient` is actually the quote recipient. `feePayer` can be a router/Factory, not the end-user wallet. Do not double-count `SnipeTaxCharged` alongside the same tax already present in `CurveTrade`, or treat Hook fee events as V4 swap-volume events.

Key indexed logs by chain, deployment, transaction hash and log index; retain block hashes for reorg handling. Backfill from the relevant deployment/rotation boundaries and reconcile lifecycle against Factory state. Receipt success, trusted emitters and refreshed state establish outcomes; a matching event topic or transaction hash alone does not.
