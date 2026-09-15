---
name: arc-aggregator
description: Build or review Peach Arc Mainnet swap integrations using the Arc Aggregator SDK, HTTP API and Execution Router contracts. Use for slippage and minimum-output safety, quote UIs, approvals, Permit2 Witness, transaction validation and routing errors; this is development guidance, not a wallet or trading agent.
---

# Arc Aggregator

Help developers implement and review Arc **Mainnet only** (`5042`) integrations. Prefer `@masterpeach/arc-aggregator-sdk`; support direct HTTP and contract clients when requested. Respond in the user's language.

## Read for the current task

| Task | Reference |
| --- | --- |
| Configure SDK/RPC, identify contracts, compare versions | [Networks and contracts](references/networks-and-contracts.md) |
| Check slippage, minimum received, price impact, Direct Allowance or Permit2 Witness | [Integration](references/integration.md) |
| Implement HTTP requests, map fields, interpret API errors | [HTTP API](references/http-api.md) |

Start with the relevant reference and the target application's installed SDK version. Use the [official overview](https://docs.peach.ag/documentation/arc/aggregator/overview) and linked feature pages to resolve details beyond these references; GitBook pages also have `.md` versions. Do not substitute the site's BSC API examples for Arc.

## Safety checks come first

- Preserve the user's **positive, after-fee minimum received**, not just their slippage percentage. Recheck it after every execution refresh, before Direct approval, before a Permit2 signature, after build and immediately before submission. A lower minimum requires a new preview and confirmation.
- Validate integer basis points and apply the application's explicit slippage/price-impact policy. SDK defaults and accepted maxima are not safety recommendations. Show fees and price impact separately; missing impact data is unknown, not zero.
- Reject stale/expired plans and changes to confirmed assets, amounts, fees, roles or network. Never fix a failure by automatically widening slippage, setting a zero minimum, editing signed/calldata deadlines or disabling validation/simulation.
- Verify the actual spender, transaction destination, recipient and zero native value. Keep full-plan validation, simulation as executor and successful-receipt checks; a simulation or hash does not guarantee settlement. Resolve uncertain submissions before retrying.

## Integration invariants

- Set `api.baseUrl` to `https://api.peach.ag/arc`; quote at `https://api.peach.ag/arc/router/find_routes`. Never use the SDK's Testnet defaults or silently switch networks.
- Pin RPC, wallet, API chain and Execution Router proxy to the same Mainnet deployment. The required `weth` is an explicit verified deployment input, not a Testnet or zero-address placeholder.
- Support fixed-input ERC-20 swaps. Use integer base units and read token decimals. USDC's ERC-20 interface has 6 decimals; native gas USDC has 18. Native swap flags are unsupported.
- `findRoutes` is a preview with no transaction or approval. After the application's user confirms, refresh execution using the confirmed order. Quote-refresh timers never execute trades.
- Direct approval targets the Router proxy. Delegated ERC-20 approval targets canonical Permit2, while its Witness spender and final transaction destination are the Router proxy.
- A graduated Launchpad token may temporarily have no route. Check lifecycle, V4 availability and indexing; do not send it back to a closed curve or force a `LAUNCHPAD` provider filter.

Generate the integration and its focused checks. Explain unresolved deployment inputs or verification failures instead of inventing them. This skill does not authorize the agent to sign or submit transactions on the developer's behalf.
