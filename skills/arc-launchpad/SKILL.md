---
name: arc-launchpad
description: Build or review Peach Arc Launchpad integrations on Arc Testnet and Mainnet using its SDK and contracts. Use for slippage and initial-buy safety, token creation, curve trading, graduation, Holder Fee Sharing, revenue claims and event indexing; this is development guidance, not autonomous token launching or trading.
---

# Arc Launchpad

Help developers integrate Launchpad on **Arc Testnet (`5042002`)** and **Arc Mainnet (`5042`)**. Prefer `@masterpeach/launchpad-sdk`; map to public contract methods when using viem, ethers or another EVM client. Respond in the user's language.

## Read for the current task

| Task | Reference |
| --- | --- |
| Select a network, verify deployment, obtain ABIs and contract roles | [Networks and contracts](references/networks-and-contracts.md) |
| Check slippage, initial-buy minima, launch economics, Holder creation or curve trades | [Creation and trading](references/creation-and-trading.md) |
| Graduation, fees, Partners, Holder claims, vesting, recovery or indexing | [Graduation and revenue](references/graduation-and-revenue.md) |

Use the [official overview](https://docs.peach.ag/documentation/arc/launchpad/overview) and the feature links in these references for task-specific details. GitBook pages also have `.md` versions. Do not load every feature guide for an ordinary creation or trade integration.

## Safety checks come first

- Preserve positive confirmed output minima for initial buys and curve trades through quote refresh, approval, preparation and submission. A closing buy has a **proportional** minimum and refund; do not advertise it as an unconditional absolute output guarantee.
- Validate slippage with SDK `assertSlippage` / `applySlippageToMinimumOut`; version 1.0.0 rejects more than `5000` bps (50%). Preserve the application's stricter risk policy when upgrading from the former 10% SDK ceiling. Show net received, fees, snipe tax and price impact separately; 50% is not a recommended tolerance.
- Changed economics, reduced minima, expired deadlines or failed validation/simulation block the current attempt. Never automatically widen slippage, zero `minInitialTokenOut` for an active buy, clear `expectedEconomics` or bypass preparation to make it pass.
- Before wallet actions, verify network/account, asset decimals, actual spender, recipients and current lifecycle. Keep prepared requests intact and reconcile successful receipts. Emergency redemption has no on-chain minimum-output argument; disclose that limitation.

## Integration invariants

- Use Testnet for teaching examples unless Mainnet is requested. Production integrations explicitly select Mainnet. Never change only the chain ID while retaining another network's deployment.
- Match the published SDK to current contract wiring, including the Holder-aware Forwarder. Run `verifyLaunchpadDeployment`; do not bypass a mismatch by overriding only the Factory.
- Check launch permissions and on-chain economics before creation. Keep a nonzero `expectedEconomics` tied to the creator's confirmed terms; never fall back to an unchecked commitment.
- Creation via Forwarder approves the current Forwarder; direct Factory creation approves Factory. Curve trades approve the token's own `BondingCurve`, resolved from Factory.
- Validate launch-token membership before reading a launch record. Use a common `blockNumber` for related mutable reads. Amounts are `bigint`; gas and ERC-20 USDC have different decimal scales.
- `prepare*` validates/simulates, `send` broadcasts, and `wait` must return `status === "confirmed"`. Pass confirmations explicitly and preserve prepared requests and gas headroom.
- `graduationReady` closes curve trading even before a sweep. Sweep, pool creation and Aggregator availability are separate conditions. An automatic-graduation failure does not necessarily fail the buy or creation.
- On Mainnet, use `arc-aggregator` if installed for post-graduation swaps; otherwise follow the official Aggregator docs. On Testnet, follow the documented V4 integration. This repository's Aggregator skill never serves Testnet.

Generate application code with wallet actions controlled by that application's user. This skill does not authorize the agent to launch tokens, change protocol configuration or operate funds on the developer's behalf.
