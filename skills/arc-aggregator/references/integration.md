# Quote and execution integration

Checked: **2026-09-15**. Verified package: **`@masterpeach/arc-aggregator-sdk@1.0.0`**; examples typechecked with `viem@2.55.10` and TypeScript `5.9.2`.

Sources: [overview](https://docs.peach.ag/documentation/arc/aggregator/overview), [Direct Allowance](https://docs.peach.ag/documentation/arc/aggregator/core-features/direct-allowance), [Permit2 Witness](https://docs.peach.ag/documentation/arc/aggregator/core-features/delegated-execution-with-permit2-witness), [slippage](https://docs.peach.ag/documentation/arc/aggregator/core-features/slippage), [client configuration](https://docs.peach.ag/documentation/arc/aggregator/core-features/api-configuration-cancellation-and-errors).

## Start with a read-only preview

Read [Mainnet configuration](networks-and-contracts.md) first. Save the following beside `aggregator-setup.ts` as `aggregator-quote.ts`. This uses the SDK HTTP client, needs no wallet or wrapped-native address, and never prepares a transaction. Pass the input amount as a positive `bigint` in token base units, after reading ERC-20 decimals and validating the user's decimal input without floating-point rounding.

```ts
// example: aggregator-quote.ts
import { getAddress, zeroAddress } from "viem";
import { ApiClient, isNativeTokenAddress } from "@masterpeach/arc-aggregator-sdk";
import { API_BASE_URL, EXECUTION_ROUTER, assertMainnetStatus } from "./aggregator-setup.js";

export async function previewMainnetSwap(
  fromInput: string, targetInput: string, amount: bigint, signal?: AbortSignal,
) {
  const from = getAddress(fromInput);
  const target = getAddress(targetInput);
  if (from === target || from === zeroAddress || target === zeroAddress ||
      isNativeTokenAddress(from) || isNativeTokenAddress(target)) {
    throw new Error("Choose two different ERC-20 token addresses");
  }
  if (amount <= 0n) throw new Error("Input amount must be positive");
  const api = new ApiClient({ baseUrl: API_BASE_URL });
  assertMainnetStatus(await api.getStatus(signal));
  const quote = await api.findRoutes({ from, target, amount, byAmountIn: true, signal });
  if (getAddress(quote.contracts.execution_router) !== getAddress(EXECUTION_ROUTER)) {
    throw new Error("Quote returned an unexpected Execution Router");
  }
  return quote;
}
```

`amount_in` and `amount_out` remain decimal integer strings. Format them using each asset's decimals. USDC ERC-20 uses 6 decimals, not the native gas denomination of 18. Quote paths and `request_id` are informational; they are not an executable plan or a delegated build artifact.

## Slippage detection and confirmed minimum

**The same slippage percentage does not preserve the same minimum received.** With zero custom fee, a preview of `100000` output units at `50` bps (0.5%) gives a confirmed minimum of `99500`. A refreshed quote of `95000` at the same tolerance gives `94525`: block the current attempt and obtain fresh confirmation. Do not overwrite `99500` in the stored confirmation when the quote refreshes.

Keep one confirmed order snapshot: pair, input, payer, executor, recipient, routing options, fee terms, slippage, deadline policy and accepted minimum. On any order/account/network change, abort old requests and discard late results. Never call `swap` from a quote-refresh timer.

Use explicit integer `slippageBps`; this SDK defaults to `50` and accepts `0..9999`. Enforce the application's configured tolerance limit **before** preparation; the SDK's wide range is not a safe product limit. Never infer approval for a higher tolerance from a failed quote or simulation. Any user-requested change needs a new preview and confirmation within application policy.

Calculate the minimum from output **after custom fees** using integer arithmetic with each division rounded down. Pool/curve/Hook fees already reflected in route output are not deducted again. For example, gross `1003`, custom fee `333` bps and slippage `50` bps produce fee `33`, net `970`, minimum `965`. Validate custom fees against current status caps and the confirmed fee recipient separately.

Save this complete example as `aggregator-minimum.ts`. Compute the bound for display with `minimumFromQuote`, store it when the user confirms, then call `requireConfirmedMinimum` on results from the validating `ArcClient`. These checks do not replace full-plan validation or checks of other confirmed terms.

```ts
// example: aggregator-minimum.ts
import type { PreparedDirectSwap, PreparedDelegatedSwap, ReadyDelegatedSwap } from "@masterpeach/arc-aggregator-sdk";

export function minimumFromQuote(
  grossOutput: bigint, customFeeBps: number, slippageBps: number,
): bigint {
  if (grossOutput <= 0n) throw new Error("Quote output must be positive");
  for (const bps of [customFeeBps, slippageBps]) {
    if (!Number.isSafeInteger(bps) || bps < 0 || bps > 9999) {
      throw new Error("Fee and slippage must be integer bps in 0..9999");
    }
  }
  const fee = grossOutput * BigInt(customFeeBps) / 10000n;
  const minimum = (grossOutput - fee) * BigInt(10000 - slippageBps) / 10000n;
  if (minimum <= 0n) throw new Error("Minimum output rounds to zero");
  return minimum;
}

export function requireConfirmedMinimum(
  result: PreparedDirectSwap | PreparedDelegatedSwap | ReadyDelegatedSwap,
  confirmedMinOut: bigint,
): void {
  if (confirmedMinOut <= 0n) throw new Error("Confirm a positive minimum output first");
  const actualMinimum = "tx" in result
    ? result.tx.amountOutMin
    : BigInt(result.raw.amount_out_min);
  if (actualMinimum < confirmedMinOut) throw new Error("Refresh the preview and confirm the new minimum");
}
```

| Checkpoint | Required protection |
| --- | --- |
| Preview and confirmation | Display expected net output, minimum received, fee amounts, tolerance and quote age; store the accepted bound |
| Direct swap preparation | Check `prepared.tx.amountOutMin` before requesting approval; repeat after any approval delay or re-preparation |
| Delegated preparation | Check `BigInt(prepared.raw.amount_out_min)` before the payer signs |
| Delegated build | Check `ready.tx.amountOutMin` against the original bound, then validate the full transaction |
| Immediately before submission | Recheck minimum, confirmed terms, wallet identity and expiry; simulate the unchanged transaction as executor |

Slippage limits adverse movement from a quote; **price impact** describes the trade's own effect on execution price. A generous minimum can still accept a poor initial quote. Show price impact only with a documented calculation and sufficiently fresh price/liquidity data; treat missing or ambiguous data (including an undocumented `deviation_ratio`) as unknown. Apply the application's separate price-impact policy and require explicit risk review where it calls for one. Fees, impact and tolerance are not interchangeable percentages.

Use an explicit quote-age policy and the validated plan's deadline, checked against chain time. Approval delays and a successful earlier simulation do not keep a plan fresh. On expiry, prepare again with permitted terms and recheck; never patch calldata or signed artifacts. Minimum-output protection does not guarantee inclusion or protection from every adverse ordering/MEV outcome.

Version 1.0.0 allows up to 60 seconds of client clock skew in the upper deadline bound for Direct and Delegated preparation. This does not extend the signed deadline, add an expiry grace period or relax the application's quote-age policy. Synchronize clocks when the difference is larger; never modify the artifact to compensate.

## Direct Allowance: payer equals executor

1. After the application's user confirms the preview, call `arc.swap` with the same order, explicit `slippageBps`, `deadlineSecs`, and `nativeIn: false`, `nativeOut: false`. It refreshes the route and returns a validated `PreparedDirectSwap`; it does not submit it.
2. Require `prepared.tx.amountOutMin >= confirmedMinOut`. A lower bound requires a fresh preview and confirmation. SDK validation of the new quote does not preserve a previous user confirmation for you.
3. Use `arc.buildDirectApprovalRequest(prepared, payer)` to obtain an exact approval if needed. The approval transaction goes to the **input token contract**; its encoded spender is the **Execution Router proxy**. Submit through the connected application wallet and require an approval receipt with `status === "success"`.
4. If approval/signing delay has made the execution stale, obtain a fresh `arc.swap` with unchanged confirmed terms, recheck its minimum and allowance. Do not edit its deadline or other calldata fields.
5. Verify the wallet chain/account, call `publicClient.call({ ...prepared.tx, account: executor })`, and submit `prepared.tx` unchanged using the wallet bound to Arc Mainnet. Retain the SDK gas fields. Check the final receipt's `status === "success"` and report actual execution events/balance changes.

Use application states for preview, confirmation, approval, preparation, submission and receipt. A wallet rejection cancels that attempt; a send timeout remains unresolved until the hash/nonce is reconciled. Prevent duplicate submissions while an order is pending.

## Permit2 Witness: different payer and executor

| Role or target | Meaning |
| --- | --- |
| Payer | Owns and supplies input tokens; signs the Witness |
| Executor | Different address; sends the final transaction and pays execution gas |
| Recipient | Explicit output recipient; preserve it through prepare/build |
| ERC-20 allowance spender | Canonical Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Witness spender / final `tx.to` | Mainnet Execution Router proxy |

After confirmation:

1. Use `arc.buildPermit2TokenApproval(from, payer, amount)` and confirm any approval **before** preparing the short-lived authorization. An existing Permit2 allowance is not a Witness signature, and a signature does not create an allowance.
2. Call `arc.prepareDelegatedSwap` with explicit payer, executor, recipient and unchanged confirmed order terms. Check `BigInt(prepared.raw.amount_out_min)` against the confirmed bound before requesting a signature; this published version has no top-level `prepared.amountOutMin` field.
3. Call `arc.signPayerAuthorization(prepared, payerWallet)`. Keep the prepared object intact. This ECDSA prepare/build flow does not establish EIP-1271 smart-wallet support.
4. Call `arc.buildDelegatedSwap(prepared, signature)`. Build accepts the frozen artifact and signature, not changed amounts or a new route. Keep full-plan validation and require `ready.tx.amountOutMin >= confirmedMinOut` on the resulting execution.
5. Simulate `ready.tx` as executor, send the unchanged transaction from that executor on Mainnet, and check the successful receipt.

Prepare provides roles, amounts, plan hash and typed authorization, but not the full executable plan. The payer trusts the API's binding of these displayed terms before signing; full transaction validation occurs after build. A failed build does not revoke the signature. Never log it, place it in a URL or reuse it for a different order. Expiry requires fresh preparation and authorization; do not loop on a rejected build.

## What to validate in a direct HTTP integration

Use `ArcClient` for execution validation even if previews use HTTP. `ApiClient` validates envelopes and shapes, not the full execution plan. If the application implements its own execution validation, use the matching Router ABI and the SDK validator behavior as the reference: chain, proxy, assets, payer/executor/recipient, input amount, fees, minimum output, deadline, native/funding mode, plan/route/settlement hashes and signatures must match the requested terms. Do not forward an arbitrary API `tx` directly to a wallet.

The SDK's native constants and generic encoding do not enable Arc native swaps. Use ERC-20 addresses, `value: 0`, and fixed input. Do not promise exact-output settlement or turn `by_amount_in=false` quoting into an exact-output contract guarantee.

## Graduation and failures

- A preview V4 `paths[].pool` is a 32-byte poolId. The corresponding `ExecutionStep.pool` is a 20-byte target, typically PoolManager. Never copy one into the other.
- On `5010`, inspect amount, provider filters, token state, pool creation and index freshness. `poolCreated` does not guarantee that the Aggregator has indexed liquidity. Remove an unintended `LAUNCHPAD`-only filter for ordinary discovery; do not fabricate a route.
- Keep transport/API errors, SDK validation failures, simulation failures and reverted receipts separate. An aborted HTTP request does not cancel a wallet prompt or an already submitted transaction.
- Record SDK version, chain, endpoint, timestamp, request/quote ID, pair, amount and error code for debugging. Exclude API credentials and payer signatures. See [HTTP errors](http-api.md).
