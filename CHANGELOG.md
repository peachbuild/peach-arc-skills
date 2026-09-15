# Changelog

## 1.0.0 — 2026-09-15

### Added

- English `arc-aggregator` skill for Arc Mainnet quotes, SDK/HTTP integration, Direct Allowance and Permit2 Witness execution.
- English `arc-launchpad` skill for Arc Mainnet and Testnet creation, curve trading, graduation, Holder Fee Sharing and revenue/recovery workflows.
- Task-specific references with network/contract mappings and compatibility checked against both SDK packages at version `1.0.0`.
- Slippage and confirmed minimum-output checks, fee rounding, approval targets, transaction validation, expiry handling and closing-buy refund guidance.
- Five complete TypeScript examples, offline checks and behavioral acceptance cases.

### Validation

- Skill structure and relative links validated; all TypeScript examples compiled and offline assertions passed.
- Read-only Mainnet API status and RPC chain identity checked. Live routes and transaction execution were not tested; full Launchpad deployment verification encountered HTTP failures.
- Launchpad SDK 1.0.0 accepts up to 50% slippage. Integrations must retain their stricter application limits and must not automatically widen tolerance.
