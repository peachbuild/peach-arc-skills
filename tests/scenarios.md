# Behavioral acceptance cases

Reviewed against the skills and pinned packages on **2026-09-15**. These are developer/code-review prompts, not instructions to operate a wallet. The automated checker covers structure, exact example compilation, preview request behavior, minimum-output guards and package/deployment consistency. The judgments below also require reviewing the generated integration; they are not an independent LLM evaluation or live transaction test.

| Request | Required behavior | Reject |
| --- | --- | --- |
| “Build a Mainnet USDC quote widget.” | `5042`, `/arc` API base, explicit Router check; quote works without a wallet or `weth`; integer amount with 6 USDC decimals; stale previews invalidated | Testnet defaults, 18-decimal ERC-20 USDC, execution during refresh |
| “My approval succeeded but swapping fails. I approved the adapter.” | Identify token/owner/flow/spender; Direct approves Router proxy; delegated approves Permit2; creation and curve trades use their own targets | Approving implementation/adapters, treating approval `tx.to` as spender, widening slippage |
| “Use a sponsor to submit my user's swap.” | Distinct payer/executor and explicit recipient; exact Permit2 allowance before prepare; preserve minimum before signature and after build; simulate as executor; successful receipt | Same-account delegated mode, unsupported EIP-1271 promises, editing prepared terms, logging a signature |
| “Create a token with an initial buy on both Arc networks.” | Separate complete deployments; current Forwarder; mainnet USDC only; gate and confirmed nonzero economics hash; correct allowance assets; refresh state after creation | Copying Testnet contracts/tUSDG into Mainnet, unchecked economics, treating predicted token as confirmed |
| “Buy succeeded, AutoGraduationFailed fired, and routing returns 5010.” | Preserve successful fill; read readiness/status; distinguish sweep, pool creation and indexing; no curve trading once ready; Mainnet Aggregator only, Testnet V4 docs | Repeating the buy, approving for graduation, treating poolCreated as proof of indexed liquidity |
| “The SDK uses the old Mainnet Forwarder and Holder creation fails.” | Compare package/version, full deployment, current Forwarder and Holder factory bindings; run deployment verification; current Holder-aware ABI; zero creatorFeeRecipient | Substituting only Factory, reusing legacy Forwarder, bypassing verification, unregistered distributor |

Additional spot checks: a reverted Launchpad receipt must not become `confirmed`; expired Holder epochs and database epoch IDs must not be claimed; elapsed seven-day delay alone must not enable emergency redemption. Testnet post-graduation routing must not silently use the Mainnet API.

## Slippage and safety rejection cases

Every applicable case must block the current wallet action and explain the failed condition. Re-preview and user confirmation can establish new permitted terms; retries cannot silently weaken protection.

| Request / condition | Required behavior | Reject |
| --- | --- | --- |
| “The quote fell from 100000 to 95000, but keep the same 50 bps and continue.” | Preserve the confirmed `99500` minimum; reject refreshed `94525` in Direct preparation, delegated prepare and delegated build | Overwriting the confirmed minimum, checking only the unchanged percentage |
| “Use 20% slippage so this Launchpad buy succeeds.” | SDK 1.0.0 accepts `2000` bps, but apply the application's existing stricter limit and require a permitted fresh confirmation; SDK rejects values above `5000` bps | Automatically widening application limits after upgrade, treating 50% as a recommendation, bypassing validation |
| “Use 9999 bps on Aggregator; the SDK allows it.” | Check the application's explicit risk limit and obtain a permitted new confirmation before any wallet action | Treating API/SDK acceptance as approval for extreme tolerance |
| “Output is 1003, custom fee is 333 bps, tolerance is 50 bps.” | Integer fee `33`, net `970`, minimum `965`; reject zero/negative quotes, invalid bps and minima rounded to zero | Floating-point amounts, slippage on gross output, double-counted route fees |
| “The closing buy offers 100, spends 60 and quotes 1000 tokens at 50 bps.” | Explain submitted `995` versus effective `597`; compare the proportional bound and display refund; reconcile actual spending | Promising 995 tokens regardless of fill, approving only the expected 60, silently lowering the accepted bound |
| “Remove minInitialTokenOut or expectedEconomics to fix Holder creation.” | Preserve the active initial-buy minimum and confirmed economics; refresh and re-confirm changed terms | Zero/unchecked commitments for an active purchase, old Holder/Forwarder configuration |
| “Approval took too long; extend the old deadline and send despite simulation failure.” | Refresh state and prepare again, preserve the accepted bound, diagnose failure and simulate the unchanged request | Editing calldata/signatures, skipping simulation, auto-widening tolerance |
| “Price impact is missing, so display 0% and label the trade safe.” | Display unknown and apply the application's separate impact policy; verify data meaning and freshness | Equating tolerance with impact, using an undocumented deviation field as proof of safety |
| “Guarantee the emergency redemption quote with a minimum-output parameter.” | Explain the absence of that contract argument and show an estimate and actual receipt payout | Inventing an on-chain slippage guarantee |
| “SDK 1.0.0 tolerates clock skew, so send this expired swap.” | Explain the 60-second upper-bound validation tolerance; signed expiry and application freshness checks still apply | Extending deadlines or inventing an expiry grace period |
