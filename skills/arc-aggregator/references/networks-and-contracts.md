# Mainnet configuration and contracts

Checked: **2026-09-15**. Verified package: **`@masterpeach/arc-aggregator-sdk@1.0.0`**, with `viem@2.55.10`.

Sources: [Client configuration](https://docs.peach.ag/documentation/arc/aggregator/core-features/api-configuration-cancellation-and-errors), [contract addresses](https://docs.peach.ag/documentation/arc/aggregator/contract-address), [published package](https://www.npmjs.com/package/@masterpeach/arc-aggregator-sdk/v/1.0.0).

Version 1.0.0 is the npm `latest` release checked on this date. Its published changelog preserves the 0.3.x integration methods and adds V4 preview pool IDs and deadline clock-skew tolerance. The GitBook changelog still names 0.3.0 as `latest`; use the published 1.0.0 package and its declarations for version-specific behavior.

## Network identity

| Setting | Required value |
| --- | --- |
| Chain ID | `5042` |
| RPC | `https://rpc.arc-scan.org` |
| API base URL | `https://api.peach.ag/arc` |
| Quote URL | `https://api.peach.ag/arc/router/find_routes` |
| Execution Router proxy | `0x2528F3190603B85A155D48C31946703d71f921ED` |
| Canonical execution Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000`, 6 decimals |

The published SDK exports `arcTestnet` and `ARC_TESTNET_CONFIG`, but no Mainnet preset. Its default API also points to Testnet. Supply the full Mainnet configuration; setting only RPC or only the API is insufficient. The SDK appends `/router/...`, so its base URL must not include `/router/find_routes`.

`ArcConfig.weth` is required even for ERC-20 execution. Obtain the verified Mainnet wrapped-native address from the deployment owner/configuration. The public configuration guide does not supply it. Do not substitute USDC, the zero address or a Testnet value. Quote-only `ApiClient` usage does not need this field; see [integration](integration.md).

## Execution contracts

| Contract | Mainnet address | Integration role |
| --- | --- | --- |
| Router proxy | `0x2528F3190603B85A155D48C31946703d71f921ED` | Swap `tx.to`, Direct approval spender, Router event emitter |
| Initial Router implementation | `0x7EE354a605bb693656EA2A08602f14122D39B024` | Implementation behind the proxy; no user approvals or submissions |
| Settlement module | `0xbF969bB9939Fbb0740F3620d65394b1ba19B21c4` | Router settlement internals |
| Uniswap V2 adapter | `0x6E29936F69a421C7F271edc1E514E7177eaACD5B` | `UNISWAPV2` execution |
| Uniswap V3 adapter | `0xA29a80C317173C82219DD3e6BecFCf47C779f82b` | `UNISWAPV3` execution |
| Uniswap V4 adapter | `0x2D1Bbf2A699F0c6cDd8aBA3E2154E81bAeC7b827` | `UNISWAPV4` execution |
| Launchpad adapter | `0x3Ac3C6BD0e8613c722CE5205b3c5b1a68ecE5CAc` | `LAUNCHPAD` execution |
| V4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | Shared V4 pool execution target |

Adapter deployment does not prove current provider availability or liquidity. Check `GET /router/status`, including `arc_router.chain_id` and `execution_router_address`, and obtain a fresh route. Missing or mismatched identity blocks an execution integration; do not infer it from the hostname.

Import `ARC_EXECUTION_ROUTER_ABI`, `ERC20_ABI`, `ArcClient`, `ApiClient` and public types from the package root. The `./chains` subpath is for chain defaults; there is no legacy `./actions` entry point. Use the matching ABI to inspect `executePlan` calldata, not to reconstruct a plan from preview paths. The Router verifies the signed plan on-chain. Index Router events at the proxy starting from the documented deployment block `19609969`; its signer configuration can change.

## Complete execution-client setup

Save this example as `aggregator-setup.ts`. It performs only reads. Pass an already verified wrapped-native address. The returned chain is also the chain to bind to the application's wallet; check the connected wallet's actual chain before submission.

```ts
// example: aggregator-setup.ts
import { createPublicClient, defineChain, getAddress, http, zeroAddress } from "viem";
import { ApiClient, ArcClient, type ApiStatusData, type ArcConfig } from "@masterpeach/arc-aggregator-sdk";

export const API_BASE_URL = "https://api.peach.ag/arc";
export const EXECUTION_ROUTER = "0x2528F3190603B85A155D48C31946703d71f921ED";
export const mainnet = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arc-scan.org"] } },
});

export function assertMainnetStatus(status: ApiStatusData): void {
  if (status.arc_router.chain_id !== mainnet.id ||
      getAddress(status.arc_router.execution_router_address) !== getAddress(EXECUTION_ROUTER)) {
    throw new Error("API chain or Execution Router does not match Arc Mainnet");
  }
}

export async function createMainnetClient(mainnetWrappedNativeAddress: string) {
  const weth = getAddress(mainnetWrappedNativeAddress);
  if (weth === zeroAddress) throw new Error("A verified Mainnet wrapped-native address is required");
  const config = {
    chainId: mainnet.id,
    rpcUrl: mainnet.rpcUrls.default.http[0],
    executionRouterAddress: EXECUTION_ROUTER,
    weth,
  } satisfies ArcConfig;
  const publicClient = createPublicClient({ chain: mainnet, transport: http(config.rpcUrl) });
  const api = new ApiClient({ baseUrl: API_BASE_URL });
  const [rpcChainId, status] = await Promise.all([publicClient.getChainId(), api.getStatus()]);
  if (rpcChainId !== mainnet.id) throw new Error("RPC is not Arc Mainnet");
  assertMainnetStatus(status);
  const arc = new ArcClient(config, publicClient, { api: { baseUrl: API_BASE_URL } });
  return { arc, publicClient, chain: mainnet };
}
```

Live verification on the check date: `GET /arc/router/status` returned HTTP `200`, business `code: 200`, `arc_router.chain_id: 5042` and the pinned Execution Router. Mainnet RPC `eth_chainId` returned `0x13b2` (`5042`). Node HTTP succeeded after curl had failed at TLS connection establishment. This verifies service/RPC identity, not route liquidity, the required wrapped-native input or transaction execution. Recheck identity at integration time.
