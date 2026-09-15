# Peach Arc Skills

English development skills for integrating Peach Arc contracts, SDKs and APIs with AI coding agents.

Skill release: **v1.0.0**. See the [changelog](CHANGELOG.md). Skill releases are versioned by Git tags independently of the SDK packages they document.

| Skill | Networks | Use it for |
| --- | --- | --- |
| [arc-aggregator](skills/arc-aggregator/SKILL.md) | Arc Mainnet only (`5042`) | Route previews, swap integration, Direct Allowance, Permit2 Witness and execution validation |
| [arc-launchpad](skills/arc-launchpad/SKILL.md) | Arc Testnet (`5042002`) and Mainnet (`5042`) | Token creation, curve trading, graduation, fee claims and contract/event integration |

These skills help generate and review application code. They do not install a wallet, operate funds, or provide a trading CLI or MCP server. SDKs remain optional for direct contract integrations.

## Safety is part of the integration

Both skills prioritize **slippage detection and preservation of the user's confirmed minimum received**. Generated code must check refreshed quotes, fees, expiry, spenders, recipients and simulations before wallet actions. A lower minimum requires renewed confirmation; retries must never silently widen slippage, zero a minimum or bypass validation. Price impact is assessed separately from slippage tolerance.

Launchpad guidance also covers initial-buy protection, proportional closing-buy minima and changes to confirmed launch economics. See the [safety acceptance cases](tests/scenarios.md) for required rejection behavior and the limits of these protections.

## Install

From a clone of this repository:

```sh
npx skills add . --skill arc-aggregator --skill arc-launchpad
```

Install from GitHub:

```sh
npx skills add peachbuild/peach-arc-skills --skill arc-aggregator --skill arc-launchpad
```

To install the exact v1.0.0 release, clone with `git clone --branch v1.0.0 --depth 1 https://github.com/peachbuild/peach-arc-skills.git`, then use the local installation command above from that checkout.

Alternatively, copy either complete skill directory, including `references/`, into your agent's supported skills directory. Each skill can be installed independently.

Example requests:

- “Use arc-aggregator to integrate a Mainnet USDC swap preview and confirmation flow.”
- “Use arc-launchpad to build Testnet token creation with an initial buy.”
- “Review our Mainnet Holder creation approvals and post-graduation trading.”
- “Audit our slippage checks: can a refreshed quote lower the confirmed minimum before signing?”

## Sources and compatibility

Checked **2026-09-15** against the [Aggregator documentation](https://docs.peach.ag/documentation/arc/aggregator/overview), [Launchpad documentation](https://docs.peach.ag/documentation/arc/launchpad/overview), and these npm releases:

| Package | Verified release |
| --- | --- |
| `@masterpeach/arc-aggregator-sdk` | `1.0.0` |
| `@masterpeach/launchpad-sdk` | `1.0.0` |
| `viem` / TypeScript, used for example checks | `2.55.10` / `5.9.2` |

Both packages resolve to npm `latest` **1.0.0** as of the check date. Aggregator 1.0.0 accepts V4 `bytes32` preview pool IDs and tolerates up to 60 seconds of client clock skew when validating deadline bounds; signed deadlines still expire normally. Launchpad 1.0.0 raises its SDK slippage ceiling from 10% to **50%**. Preserve the application's existing, stricter risk limits when upgrading; the SDK ceiling is not a recommended tolerance. The checked Launchpad deployment addresses and integration method signatures remain unchanged.

Aggregator uses `https://api.peach.ag/arc`, including [find_routes](https://api.peach.ag/arc/router/find_routes). Its SDK defaults to Testnet, so the skill supplies explicit Mainnet configuration. Mainnet wrapped-native configuration must come from a verified deployment; no address is invented here.

Launchpad's verified package includes the current Holder-aware Forwarder on both networks. Deployment addresses are dated snapshots. Check RPC chain identity and current deployment wiring before using an application integration.

Validation covers structure, local links, compiled examples, offline checks and the [behavioral acceptance cases](tests/scenarios.md). A live Node HTTP request verified `/arc/router/status` with HTTP/business success, chain `5042` and the documented Router; the Mainnet RPC also returned chain `5042`. Full SDK deployment verification on both Launchpad networks encountered HTTP failures, so current on-chain wiring/economics remain unverified. No live route, transaction simulation, approval, signature or on-chain transaction is claimed.

The organization draws on [Jupiter](https://github.com/jup-ag/agent-skills) and [0x](https://github.com/0xProject/0x-ai) for integration guidance, [Pump.fun](https://github.com/pump-fun/pump-fun-skills) for lifecycle separation, and [Meteora](https://github.com/MeteoraAg/meteora-invent/tree/main/skills/meteora) for version discipline. Peach sources determine the protocol behavior.

## Validate

Requires Node.js 20 or newer. Structure checks have no dependencies:

```sh
node tests/check.mjs
```

For type and offline behavior checks, create a temporary consumer and install the pinned packages with install scripts disabled:

```sh
consumer_dir=$(mktemp -d)
npm install --prefix "$consumer_dir" --ignore-scripts --no-audit --no-fund --save-exact \
  @masterpeach/arc-aggregator-sdk@1.0.0 \
  @masterpeach/launchpad-sdk@1.0.0 \
  viem@2.55.10 typescript@5.9.2
node tests/check.mjs --consumer "$consumer_dir"
```

The checker extracts the exact TypeScript examples into the supplied temporary consumer, compiles them, and runs offline assertions. Repeat these checks and the relevant acceptance cases when changing SDK versions or deployment references.

## License

[MIT](LICENSE) © 2026 giveuonepeach.
