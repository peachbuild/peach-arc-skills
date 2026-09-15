# Networks, deployment verification and ABIs

Checked: **2026-09-15**. Verified package: **`@masterpeach/launchpad-sdk@1.0.0`**, with `viem@2.55.10`. The package's deployment exports were compared with the public address page. Attempts to run the full `verifyLaunchpadDeployment` check on both networks encountered HTTP failures; current on-chain wiring and economics are not claimed as verified.

Sources: [contract addresses](https://docs.peach.ag/documentation/arc/launchpad/contract-address), [quickstart](https://docs.peach.ag/documentation/arc/launchpad/quickstart), [SDK/contract map](https://docs.peach.ag/documentation/arc/launchpad/core-features), [published package](https://www.npmjs.com/package/@masterpeach/launchpad-sdk/v/1.0.0).

## Select the whole deployment

| Setting | Testnet | Mainnet |
| --- | --- | --- |
| Chain ID | `5042002` | `5042` |
| RPC | `https://rpc.testnet.arc.io` | `https://rpc.arc-scan.org` |
| SDK export | `arcTestnetLaunchpadDeployment` | `arcMainnetLaunchpadDeployment` |
| SDK contractVersion | `production-v2-arc-testnet-rc2` | `production-v2-arc-mainnet-v1` |
| Quote assets | USDC and test-only tUSDG | USDC |
| Holder-aware creation | Supported by the checked deployment | Supported by the checked deployment |

Use Testnet for tutorials, with an explicit network selection in application configuration. Never fall back to another network when an RPC fails. Persist/index state by chain and deployment identity; RC1 and RC2 records cannot be merged. Network selection must replace the complete deployment, not just Factory or chain ID.

The public docs report launches open on both networks, but availability is mutable. Read the current creator's launch gate before creating; the SDK capability flag is only an application setting.

## Core address snapshot

| Contract | Testnet | Mainnet |
| --- | --- | --- |
| LaunchFactory | `0xd60804941f49270C74F4C7E8686e288723360A75` | `0x7E462d220b6b0a4c55B205B613133dc1C1Cc9dC1` |
| Current LaunchForwarder | `0xEfFef0A2059E0B61b9253403AfB43a414F0994A9` | `0x7b9720bC177e8B6F96962e9b15891f27108cAd40` |
| FeeEscrow | `0x305bf6885Ba7D1a9Ac9Fbc4F7e7b687F559761d4` | `0x29Ad26C48267B791DC2f6A2D4f3Fd819E6301540` |
| PartnerRegistry | `0xcbAEf9E31D5be62CD084CC41EE20388D3f712A01` | `0x65ED91aaC042496be1A0527949fe216c1Df362C5` |
| BuybackVault | `0xAA5Df9a50F3eBc600b734e61427236088d961EEB` | `0x139271e6694B4047949cDD0D4343d116dc732113` |
| GraduationCoordinator | `0x29C0eCc2eBb025A0bBcB053D8Be9763b92765a64` | `0xD25E4bdABb03437e430a31d9bFef547096a3E596` |
| MemeHook | `0x0aB71ad97c1304CfbDb0CC99eBCC2f8B98Aae044` | `0x173c4Bdd5CF95A935D2B5636C573C5F4DF062044` |
| HolderDistributorFactory | `0x091452d669652828a76A89c9b16c9CA282eb188F` | `0x14177a906578CD3A5535d892D2929CF73097c547` |
| V4 PoolManager | `0x2756F3F7bFAf103F4c550f4d24CdCa82B093240A` | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| Launchpad V4 Permit2 | `0xEA93b65F177751F059Dbba1F8D8f389F7227FF25` | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

USDC's ERC-20 address is `0x3600000000000000000000000000000000000000` on both networks, with 6 decimals. Testnet tUSDG is `0x4608e7FC3163f11c241a7cDD1C8A7d46F150e37a`, also 6 decimals, and must not appear in a Mainnet launch. Native gas USDC uses 18 decimals. Read actual asset decimals and approved quote-token configuration.

The old Mainnet Forwarder `0x9C87E4bf9720b7e40DeD02D23193F75Cb3E6dFF7` is retained in the checked SDK as `legacyLaunchForwarder` for history, not as a creation fallback. Earlier SDK snapshots also omitted the Mainnet Holder factory. Upgrade/reconcile the full deployment and its ABI when these values differ. `verifyLaunchpadDeployment` checks identity, wiring and economics, including the Factory's current Forwarder and the Holder factory's authorized Forwarder. Do not suppress its failures.

## SDK to contract map

Import public helpers/types from `@masterpeach/launchpad-sdk` and contract ABIs from **`@masterpeach/launchpad-sdk/abi`**. Do not copy ABI fragments from an older deployment.

| Task | SDK operation | Public contract/ABI |
| --- | --- | --- |
| Membership / curve discovery | `isLaunchToken`, `getCurveAddress`, `getLaunchRecord` | Factory `curveFor(token)`, `getLaunchedToken(token)`; `launchFactoryAbi` |
| Ordinary creation / initial buy | `prepareLaunchAndBuy` | Current Forwarder `launchAndBuy(params)`; `holderAwareLaunchForwarderAbi` |
| Holder creation | `prepareLaunchWithHolderFeeSharing` | Current Forwarder `launchWithHolderFeeSharing(params, initializationData)`; `holderAwareLaunchForwarderAbi` |
| Advanced direct creation | `prepareCreateToken` | Factory `createToken(params)`; `launchFactoryAbi` |
| Curve buy / sell | `prepareBuy`, `prepareSell` | Per-token `buyExactIn` / `sellExactIn`; `bondingCurveAbi` |
| Sweep / create graduated pool | `prepareGraduate`, `prepareCreateGraduatedPool` | Factory `graduate(token)` / `createGraduatedPool(token)` |
| Read lifecycle events | Parsed receipt or indexer | Coordinator `graduationCoordinatorAbi`; it emits graduation events |
| Discover V4 pool / fee state | `getPoolId` and Hook reads | `MemeHook.poolForToken`, `poolConfig`; `memeHookAbi` |
| Recipient / Partner claims | `prepareClaim`, `preparePartnerClaim` | FeeEscrow `claimToken` / `claimPartner`; `feeEscrowAbi` |
| Holder discovery / claims | `getHolderDistributor`, `prepareHolderClaim` | `holderDistributorFactoryAbi` and per-token `holderDistributorAbi` |
| Buyback release | `prepareBuybackRelease` | BuybackVault `release(token)`; `buybackVaultAbi` |
| Emergency redemption | `prepareEmergencyRedeem` | Active per-launch `emergencyDistributorAbi` |

The Factory is not the curve-trade counterparty. Resolve each token's curve; do not pin one curve for all launches. Resolve Holder distributors through the registry, not by assuming every creator fee recipient is a distributor. Internal deployment/activation methods and Hook callbacks are not general wallet entry points. LaunchLocker provides custody/position information, not a general LP withdrawal flow.

## Complete client setup

Save as `launchpad-setup.ts`. Pass `"testnet"` for a tutorial or explicitly `"mainnet"` for production. The SDK requires application URL metadata; the example neither invents a Launchpad HTTP service nor starts subscriptions. Use the application's own origin for `apiBaseUrl` and the chosen RPC for `realtimeUrl` if following the official RPC-only quickstart. Supply the application's actual explorer URL.

```ts
// example: launchpad-setup.ts
import { createPublicClient, defineChain, http, type WalletClient } from "viem";
import {
  arcMainnetLaunchpadDeployment, arcTestnetLaunchpadDeployment,
  createLaunchpadFactoryClient, defineLaunchpadChain, verifyLaunchpadDeployment,
} from "@masterpeach/launchpad-sdk";

export const deployments = {
  testnet: arcTestnetLaunchpadDeployment,
  mainnet: arcMainnetLaunchpadDeployment,
} as const;

export async function connectLaunchpad(
  network: keyof typeof deployments,
  app: { explorerUrl: string; apiBaseUrl: string; realtimeUrl: string },
  walletClient?: WalletClient,
) {
  if (!Object.hasOwn(deployments, network)) throw new Error("Choose Arc Testnet or Mainnet");
  const deployment = deployments[network];
  const rpcUrl = network === "testnet" ? "https://rpc.testnet.arc.io" : "https://rpc.arc-scan.org";
  const walletChain = defineChain({
    id: deployment.chainId, name: `Arc ${network}`,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: network === "testnet",
  });
  const publicClient = createPublicClient({ chain: walletChain, transport: http(rpcUrl) });
  if (await publicClient.getChainId() !== deployment.chainId) throw new Error("Wrong RPC chain");
  if (walletClient && await walletClient.getChainId() !== deployment.chainId) {
    throw new Error("Switch the wallet to the selected Arc network");
  }
  const chain = defineLaunchpadChain({
    slug: `arc-${network}`, chainId: deployment.chainId, family: "evm",
    nativeCurrency: { symbol: "USDC", decimals: 18 }, rpcUrls: [rpcUrl],
    ...app, deployment, quoteTokens: deployment.economics.quoteTokens,
    capabilities: { create: true, bondingTrade: true, partnerAttribution: true },
    confirmations: 2,
  });
  await verifyLaunchpadDeployment(publicClient, deployment);
  const client = createLaunchpadFactoryClient({ publicClient, walletClient, chain });
  return { client, publicClient, walletClient, walletChain, chain, deployment };
}
```

Omit `walletClient` for reads; for writes pass a connected wallet with an attached account. Request connection from a user action in the application. Recheck account/network when acting on a prepared transaction. The example's `confirmations: 2` follows the quickstart; pass it explicitly to `client.wait(hash, { confirmations: chain.confirmations })` because `wait` does not inherit it.
