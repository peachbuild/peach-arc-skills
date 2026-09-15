# Creation and curve trading

Checked: **2026-09-15**. Verified package: **`@masterpeach/launchpad-sdk@1.0.0`**; complete examples typechecked with `viem@2.55.10` and TypeScript `5.9.2`.

Sources: [token creation](https://docs.peach.ag/documentation/arc/launchpad/core-features/token-creation), [approvals](https://docs.peach.ag/documentation/arc/launchpad/core-features/approvals), [curve trading](https://docs.peach.ag/documentation/arc/launchpad/core-features/bonding-curve-trading), [token information](https://docs.peach.ag/documentation/arc/launchpad/core-features/token-information), [quickstart](https://docs.peach.ag/documentation/arc/launchpad/quickstart).

## Slippage and transaction safety

Store the user's accepted input, output recipient, positive minimum, fees/taxes, network and deadline with the confirmation. Keeping the same `slippage.bps` after a lower quote does **not** preserve the same minimum. Recheck after approval delays, fresh preparation and immediately before submission; block the current attempt if the effective minimum falls below the accepted bound.

Use `assertSlippage` / `applySlippageToMinimumOut` from the pinned SDK: integer `0..5000` bps (0..50%) only. Version 1.0.0 raises `MAX_SLIPPAGE_BPS` from `1000` to `5000`; keep the application's existing stricter limit explicit, rather than deriving it from this SDK constant. The latter helper also rejects nonpositive quotes and a minimum rounded to zero. Apply the application's explicit tolerance/price-impact limits within the SDK ceiling; never default to its maximum or bypass it with direct calldata. Any tolerance change requires a fresh preview and user confirmation. Keep raw amounts as `bigint` and distinguish the assets' decimals.

| Operation | Output protection to preserve |
| --- | --- |
| Ordinary or Holder creation with initial buy | Positive `minInitialTokenOut` plus the confirmed nonzero `expectedEconomics`; zero minimum only when there is no initial buy |
| Curve buy | Minimum calculated from net `tokenOut`; for closing buys, apply the proportional rule below and display the refund |
| Curve sell | Minimum calculated from **`netQuoteOut`**, not `grossQuoteOut`; fees are already deducted |
| Fee sweep with conversion/buyback | Meaningful minimum for every active conversion leg; do not use zero as an unchecked placeholder |
| Emergency redemption | No contract minimum-output argument; see the limitation in [recovery](graduation-and-revenue.md) |

Show price impact separately from slippage, fees, Creator Tax and buy-side snipe tax. Use SDK quotes for these amounts; do not deduct a tax twice. Missing impact data is unknown, not zero. Check quote age, chain timestamp, trading availability and current economics again before preparing; an unexpired deadline alone does not make a quote fresh. Simulation failure requires diagnosing and refreshing state, never increasing slippage automatically, extending an old request's deadline or sending around `prepare*`.

## Creation terms

Start with [verified network setup](networks-and-contracts.md). Use `prepareLaunchAndBuy` for ordinary creation with an optional initial buy. Direct `prepareCreateToken` is an advanced Factory path. Both use `LaunchpadCreateTokenParams`.

Build the creation form around the public type:

| Input group | Fields and rules |
| --- | --- |
| Metadata | `name`, `symbol`, `logo`, `description`, `socials`; validate encoded UTF-8 byte limits with SDK helpers, not JavaScript `.length` |
| Economics | Approved `quoteToken`, enabled `launchConfigId`, nonzero `expectedEconomics` from current chain state |
| Creator revenue | `creatorFeeRecipient`, `creatorTaxBps`, `buybackEnabled`; apply current policy caps; zero recipient normally resolves to creator |
| Initial buy | `creatorInitialBuyQuoteRaw`, `creatorInitialBuyRecipient`, `minInitialTokenOut`; use zero input/minimum only when there is no initial buy |
| Tax exemptions | `launchTaxExemptions`; use `launchpadLaunchTaxExemptions` for automatic exemptions and duplicate handling |
| Uniqueness / expiry | Cryptographically random bytes32 `salt`; future `deadline` from chain time; check `isLaunchpadSaltUsed` after an uncertain creation |

The creator must pass `getLaunchGate(creator).canLaunch`. Denylisting still blocks a whitelisted creator; public launch being disabled can admit a whitelisted creator. Do not implement the gate as a single global boolean.

Read selected quote economics, launch configuration and fee policy at one block. Save the values shown to the creator with their `expectedEconomics`. An economics-hash mismatch requires refreshed terms and confirmation, never `UNCHECKED_ECONOMICS` or a zero hash.

The following complete read-only helper prepares the economics **for display and confirmation**. It neither prepares nor submits a transaction. Save as `launchpad-terms.ts`; validate the form and initial-buy quote separately using the official creation guide.

```ts
// example: launchpad-terms.ts
import { type Address, type PublicClient } from "viem";
import {
  getLaunchpadFeePolicy, launchpadEconomicsHash,
  type LaunchpadCreateTokenParams, type LaunchpadFactoryClient,
} from "@masterpeach/launchpad-sdk";

export async function readLaunchTerms(
  client: LaunchpadFactoryClient,
  publicClient: PublicClient,
  creator: Address,
  form: Omit<LaunchpadCreateTokenParams, "expectedEconomics">,
) {
  const blockNumber = await publicClient.getBlockNumber();
  const readOptions = { blockNumber };
  const gate = await client.getLaunchGate(creator, readOptions);
  if (!gate.canLaunch) throw new Error("This creator cannot launch");
  const [resolved, feePolicy] = await Promise.all([
    client.validateAndResolve({ quoteToken: form.quoteToken, launchConfigId: form.launchConfigId }, readOptions),
    getLaunchpadFeePolicy({ publicClient, deployment: client.deployment }, readOptions),
  ]);
  const expectedEconomics = launchpadEconomicsHash({
    ...resolved.quoteTokenEconomics, ...resolved.launchConfig, ...feePolicy,
  });
  const params = { ...form, expectedEconomics } satisfies LaunchpadCreateTokenParams;
  return { params, resolved, feePolicy, blockNumber };
}
```

## Approvals and transaction sequence

| Operation | Approve this asset | Spender |
| --- | --- | --- |
| `prepareLaunchAndBuy` / Holder launch | Initial-buy quote asset and any current launch-fee asset | Current `deployment.contracts.launchForwarder` |
| Direct `prepareCreateToken` | Initial-buy quote asset and any current launch-fee asset | Factory |
| Curve buy | The launch record's quote asset | That token's BondingCurve |
| Curve sell | Launch token | That token's BondingCurve |

Read the current launch fee and its asset. Combine initial-buy and fee amounts only if the asset is the same; otherwise use separate allowances. With zero initial buy and zero fee, no approval is needed. `approve(spender, amount)` sets allowance to that amount: approve the required total, not just an allowance shortfall. Approval transactions go to the asset contract.

Use `getApprovalStatus({ asset, owner, spender, requiredAmount })` with an explicit spender, then `prepareApprove({ asset, spender, amount })` only as needed. Confirm each approval before `prepare*`, because preparation simulates the funded call. Freshly prepared terms must still satisfy the creator's accepted economics, input, minimum and deadline.

For creation, call the selected prepare method, review its preview, then let the application wallet call `client.send(prepared)`. Preserve the exact prepared object, which carries SDK validation and simulation state. Call `client.wait(hash, { confirmations: chain.confirmations })` and require `status === "confirmed"` plus the Factory's `TokenCreated` event. Predicted addresses and Solidity return values from simulation do not prove a launch was created.

An initial buy can trigger graduation in the same transaction. Refresh `getGraduation(created.token)` after creation and show `autoGraduationFailures` independently from creation success. A send timeout requires checking the known hash, salt usage and token existence before creating again; do not replace the salt and blindly resubmit.

## Optional Holder Fee Sharing

- Require the current `contracts.holderDistributorFactory`, correctly bound to the current Holder-aware Forwarder, and `client.isHolderQuoteTokenAllowed(quoteToken)`.
- Use `client.prepareLaunchWithHolderFeeSharing(params)` with **`creatorFeeRecipient: zeroAddress`**. Do not supply a predicted distributor as the recipient; the Forwarder substitutes it before deriving the launch address.
- Omit custom `distributorInitializationData` for the default path: the SDK reads the factory's adapter version and encodes it. If explicitly customizing initialization, use the matching adapter documentation and ABI.
- Approve the current Forwarder, keep the economics commitment, and inspect predicted token/curve/distributor plus `graduatesOnCreate` in the preview. Predictions do not replace receipt validation.
- Reconcile Factory `TokenCreated`, Forwarder `HolderSharingLaunchCreated` and Holder factory `DistributorCreated`, then read `getHolderDistributor(token)` and verify registration/bindings. An ordinary fee recipient is not automatically a Holder Distributor.

Fee sharing does not make the creator fee recipient immutable. Apply current recipient-transfer and governance semantics when presenting ongoing revenue ownership.

## Buying and selling

Validate `client.isLaunchToken(token)` before reading its record. Unknown tokens can return zero-filled registry data instead of reverting. For related state reads, share `blockNumber`; fetch the launch's actual quote asset and token decimals, not a hard-coded asset from a tutorial.

1. Read token state and ensure curve trading is available: `notGraduated` **and** not `graduationReady`. Fees, Creator Tax and the transient buy-side snipe tax affect the quote. Use `quoteLaunchpadBuy` / `quoteLaunchpadSell` or the SDK's prepare previews instead of duplicating curve math.
2. Present gross input, actual expected spending/output, fees, refunds and minimum received in the correct assets. Use `applySlippageToMinimumOut` and integer arithmetic. Keep the user's positive minimum and full order snapshot.
3. Confirm any required exact allowance to `record.curve`, then call `client.prepareBuy({ token, quoteInRaw, tokenRecipient, slippage, deadline })` or `prepareSell({ token, tokenIn: tokenInRaw, quoteRecipient, slippage, deadline })`. Add a checked `partnerId` only when attribution is requested.
4. Preparation refreshes and simulates. Recheck the effective minimum against the confirmed bound; changed terms need confirmation. Submit the unchanged prepared object, require a confirmed result, and show the actual fill from the receipt.

### Closing buys

A closing buy can spend less than the offered quote and refund the remainder. Reduce an over-offer to the preview's `quote.quoteSpent` before requesting approval where appropriate. Allowance still covers the full submitted input, not an expected post-refund net debit.

The contract scales its submitted minimum by actual spending. For a fresh `buy` prepared from the confirmed `quoteInRaw`, the current preview's effective minimum is:

`mulDivUp(applySlippageToMinimumOut(buy.preview.tokenOut, slippage), buy.preview.quoteSpent, quoteInRaw)`

For example, `tokenOut = 1000`, `50` bps tolerance, `quoteSpent = 60` and offered input `100` give a submitted minimum of `995` but an effective minimum of **`597`**. Compare the effective bound with what the user accepted, not `995`. Actual spending can change at execution, so this is proportional protection, not an unconditional promise to receive at least the preview's absolute amount. Display that distinction alongside the expected refund.

Send the prepared request unchanged, including automatic-graduation gas headroom. Final spending/refunds come from receipt events, not the original offered amount. If the refreshed effective minimum decreases below the accepted bound, re-preview and confirm; do not silently increase slippage.

For a direct contract implementation, read the linked feature's **Direct contract calls** section and encode the matching `CreateTokenParams` or `buyExactIn`/`sellExactIn` overload using the published ABI. Factory creation, Forwarder funding and per-token curve execution are distinct paths. Simulate writes as the actual account and reconcile receipts by emitter address.
