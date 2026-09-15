# Arc Mainnet HTTP API

Checked: **2026-09-15**. Verified SDK contract: **`@masterpeach/arc-aggregator-sdk@1.0.0`**, specifically its published `ApiClient` and type declarations. Live status returned HTTP/business success, chain `5042` and the documented Router. Route and execution response shapes below were checked against the published SDK, not live swap requests.

Sources: [published SDK](https://www.npmjs.com/package/@masterpeach/arc-aggregator-sdk/v/1.0.0), [client configuration and errors](https://docs.peach.ag/documentation/arc/aggregator/core-features/api-configuration-cancellation-and-errors), [Direct Allowance](https://docs.peach.ag/documentation/arc/aggregator/core-features/direct-allowance), [Permit2 Witness](https://docs.peach.ag/documentation/arc/aggregator/core-features/delegated-execution-with-permit2-witness).

The Overview's `/api-reference/arc-aggregator` link was unavailable on the check date. The site's generic API Reference displays BSC examples. This reference uses the published **Arc** client contract and Arc feature guides; do not copy BSC native-token behavior or remove `/arc` from the base URL.

## Endpoints

Base URL: **`https://api.peach.ag/arc`**. The table documents the methods used by the verified SDK.

| Method and path | SDK method | Result |
| --- | --- | --- |
| `GET /router/status` | `ApiClient.getStatus()` | Providers, indexing state, router identity and fee policy |
| `GET /router/find_routes` | `findRoutes(...)` | Indicative quote; no transaction, plan or payer signature |
| `GET /router/swap` | `swap(...)` | Direct execution; `DIRECT_ALLOWANCE` / `TRANSACTION_READY` |
| `GET /router/swap/prepare` | `swapPrepare(...)` | Delegated artifact; `PERMIT2_WITNESS` / `PAYER_SIGNATURE_REQUIRED` |
| `POST /router/swap/build` | `swapBuild(...)` | Frozen delegated transaction; `PERMIT2_WITNESS` / `TRANSACTION_READY` |

`ArcClient.swap` and its prepare/build methods add execution validation to these raw HTTP operations. A ready transaction is not a mined transaction.

## Request fields

Send fixed input with `by_amount_in=true`. In query strings, booleans and numbers are textual values. Amounts are decimal integer strings, never JSON floating-point values.

| HTTP field | SDK field | Meaning |
| --- | --- | --- |
| `from`, `target` | Same names | Distinct input/output ERC-20 addresses |
| `amount` | `amount: bigint` | Positive input amount in raw token units |
| `by_amount_in` | `byAmountIn` | Use `true` in this integration |
| `v` | Sent by SDK | `1001500` |
| `depth` | `depth` | Route depth; SDK sends `3` by default |
| `split_count` | `splitCount` | Route split setting; SDK sends `20`, not a promise of 20 paths |
| `providers` | `providers: string[]` | Optional comma-separated provider identifiers from status; omit for normal discovery |
| `executor` | `executor` | Required final transaction sender for execution requests |
| `payer` | `payer` | Direct defaults to executor; delegated requires a different payer |
| `recipient` | `recipient` | Direct defaults to executor; delegated requires an explicit recipient |
| `slippage_bps` | `slippageBps` | Integer 0–9999; SDK default `50` means 0.5% |
| `deadline_secs` | `deadlineSecs` | Positive relative lifetime in seconds; SDK default `120` |
| `custom_fee_bps` | `customFeeBps` | Default `0`; bounded by active router policy; output fee |
| `custom_fee_receiver` | `customFeeReceiver` | Required for positive fee; nonzero, distinct from recipient and Router |
| `native_in`, `native_out` | `nativeIn`, `nativeOut` | Omit or `false`; Arc execution is ERC-20-only |

The execution-only fields apply to swap and prepare, not to a plain preview. There is no documented custom `partner_id` or arbitrary `hookData` field on these execution requests. Do not invent one to pass Launchpad attribution through the Aggregator.

Build accepts only a bytes32 `quote_id` and the payer signature in its JSON body; it does not accept changed order terms:

```json
{
  "quote_id": "<fresh prepare quote_id>",
  "payer_signature": "<payer ECDSA signature for that prepared authorization>"
}
```

Those strings describe required inputs, not replayable artifacts. A preview `request_id` cannot be used as `quote_id`. Send signatures only in the build body, never in query parameters or logs. Expired artifacts require a new prepare and signature.

For a quote-only HTTP request, provide actual Mainnet token addresses and an integer amount in the environment:

```sh
curl --fail-with-body --get 'https://api.peach.ag/arc/router/find_routes' \
  --data-urlencode "from=${FROM_TOKEN:?Set the input ERC-20 address}" \
  --data-urlencode "target=${TO_TOKEN:?Set the output ERC-20 address}" \
  --data-urlencode "amount=${AMOUNT_RAW:?Set a positive integer input amount}" \
  --data-urlencode 'by_amount_in=true' \
  --data-urlencode 'v=1001500'
```

This shell command does not check business success; parse and validate the response as described below. It performs no approval, signature or execution.

## Response interpretation

- Require both an HTTP success and a JSON envelope with `code: 200`; success data is under `data`. Handle malformed/non-JSON responses separately.
- Status exposes `providers`, `chainflows`, and `arc_router`. Check `chain_id === 5042` and the pinned Router, not just that `providers` is nonempty. Policy caps are live configuration.
- Quote exposes `request_id`, `quote_ts`, `amount_in`, `amount_out`, `paths` and `contracts.execution_router`. A path includes provider, adapter, pool identifier, currencies, direction, fees, per-leg amounts and optional `extra_data`.
- Direct execution includes `quote_id`, `plan_hash`, roles, fees, signatures and `tx`. `tx` contains `to`, `data`, `value`, `entrypoint: "executePlan"` and `amount_out_min`.
- Prepare includes `quote_id`, `plan_hash`, roles, amounts, `amount_out_min` and `payer_authorization` (Permit2 owner/token/amount/nonce/deadline/Witness typed data). It has no executable `tx` or full plan.
- Build returns the transaction for that frozen artifact. SDK Direct/ready results expose `tx.amountOutMin` as `bigint`; a delegated prepared minimum is `BigInt(prepared.raw.amount_out_min)` in version `1.0.0`.
- Amounts and nonces use arbitrary-precision integers. `quote_ts` and chainflow `update_at` are Unix milliseconds; plan and Witness deadlines are Unix seconds. `deadline_secs` is a duration, not an absolute timestamp.
- Version 1.0.0 accepts preview pool identifiers as addresses (V2/V3) or bytes32 (V4); `ApiRoutePath.pool` is now a `string`, not an address-only type. Execution targets remain 20-byte addresses. Do not hand-build execution steps from previews.

Optional SDK `apiKey` is sent as the `apikey` query parameter. Keep private credentials on a backend and redact query strings. Do not assume a permanent authentication exemption or an unlimited quota. Do not cache signed execution artifacts as reusable quotes.

## Error handling

| Business code | Meaning | Application response |
| --- | --- | --- |
| `4000` | Invalid request | Correct parameters/roles |
| `4030` | Forbidden | Inspect access or rejection reason |
| `4040` | Token-risk rejection | Stop the swap and investigate the token |
| `5000` | Internal error | Bounded retry for a read; preserve request ID |
| `5010` | No usable route | Check pair, amount, filters, lifecycle, liquidity and indexing |
| `5030` | Service unavailable | Back off; refresh availability |
| `5040` | Unsupported API version | Send the documented `v=1001500` |

`ArcApiError.code` and `.status` are separate: local cancellation/timeout can use `408`, malformed/transport failures can use `0`, and `status` holds an HTTP status when available. SDK execution validation failure is a different stage; never disable it to work around an API error. A transaction with an uncertain submission status must be reconciled before another send.
