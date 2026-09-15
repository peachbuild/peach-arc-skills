import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["README.md", "CHANGELOG.md", "tests/scenarios.md", ...readdirSync(join(root, "skills"), { recursive: true })
  .filter(name => name.endsWith(".md")).map(name => join("skills", name))];
const examples = new Map();
let links = 0;
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  if (file.endsWith("SKILL.md")) {
    // This repository uses single-line name/description fields, not a general YAML parser.
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert(frontmatter, `${file}: missing frontmatter`);
    const name = frontmatter[1].match(/^name: ([a-z0-9-]+)$/m)?.[1];
    assert.equal(name, file.split(/[\\/]/).at(-2), `${file}: name must match directory`);
    assert.match(frontmatter[1], /^description: .+$/m, `${file}: missing description`);
  }
  for (const match of text.matchAll(/```ts\n\/\/ example: ([a-z0-9-]+\.ts)\n([\s\S]*?)\n```/g)) {
    assert(!examples.has(match[1]), `Duplicate example: ${match[1]}`);
    examples.set(match[1], match[2]);
  }
  assert.equal((text.match(/```ts\n/g) ?? []).length,
    [...text.matchAll(/```ts\n\/\/ example:/g)].length, `${file}: unlabelled TypeScript example`);
  for (const [, target] of text.replace(/```[\s\S]*?```/g, "").matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^https:\/\//.test(target)) { new URL(target); continue; }
    const path = target.split("#")[0];
    if (path) assert(existsSync(resolve(root, dirname(file), path)), `${file}: broken link ${target}`);
    links++;
  }
}
assert.equal(files.filter(file => file.endsWith("SKILL.md")).length, 2);
assert.equal(examples.size, 5);
console.log(`Structure OK: 2 skills, ${links} local links, ${examples.size} complete TypeScript examples`);

const args = process.argv.slice(2);
if (args.length === 0) process.exit(0);
assert(args.length === 2 && args[0] === "--consumer", "Usage: node tests/check.mjs [--consumer TEMP_DIRECTORY]");
const consumer = resolve(args[1]);
assert(consumer !== resolve(root) && !consumer.startsWith(root), "Use a temporary consumer outside the repository");
const modules = join(consumer, "node_modules");
for (const [name, version] of Object.entries({
  "@masterpeach/arc-aggregator-sdk": "1.0.0",
  "@masterpeach/launchpad-sdk": "1.0.0",
  viem: "2.55.10", typescript: "5.9.2",
})) {
  assert.equal(JSON.parse(readFileSync(join(modules, name, "package.json"), "utf8")).version, version);
}
const output = join(consumer, "peach-arc-skill-examples");
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "package.json"), JSON.stringify({ type: "module" }));
for (const [name, source] of examples) writeFileSync(join(output, name), source);
writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
  compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
    strict: true, skipLibCheck: true, outDir: "compiled" }, include: [...examples.keys()],
}));
execFileSync(process.execPath, [join(modules, "typescript/bin/tsc"), "-p", join(output, "tsconfig.json")], { stdio: "inherit" });
const load = name => import(pathToFileURL(join(output, "compiled", name)).href);
const { assertMainnetStatus, createMainnetClient, API_BASE_URL, EXECUTION_ROUTER } = await load("aggregator-setup.js");
const { previewMainnetSwap } = await load("aggregator-quote.js");
const { minimumFromQuote, requireConfirmedMinimum } = await load("aggregator-minimum.js");
const { deployments, connectLaunchpad } = await load("launchpad-setup.js");
const { readLaunchTerms } = await load("launchpad-terms.js");
await assert.rejects(createMainnetClient("0x0000000000000000000000000000000000000000"));
await assert.rejects(connectLaunchpad("unsupported", {}), /Choose Arc Testnet or Mainnet/);
await assert.rejects(readLaunchTerms({ getLaunchGate: async (_creator, options) => {
  assert.equal(options.blockNumber, 77n);
  return { canLaunch: false };
} }, { getBlockNumber: async () => 77n }, "0x1111111111111111111111111111111111111111", {}), /creator cannot launch/);

const status = { providers: ["UNISWAPV4"], chainflows: [], arc_router: {
  chain_id: 5042, execution_router_address: EXECUTION_ROUTER,
  max_custom_fee_bps: 100, max_protocol_cut_bps: 10000,
} };
assertMainnetStatus(status);
for (const overrides of [{ chain_id: 5042002 }, { chain_id: undefined },
  { execution_router_address: "0x1111111111111111111111111111111111111111" }]) {
  assert.throws(() => assertMainnetStatus({ ...status, arc_router: { ...status.arc_router, ...overrides } }));
}
for (const minimum of [99n, 100n, 101n]) {
  for (const result of [{ tx: { amountOutMin: minimum } }, { raw: { amount_out_min: String(minimum) } }]) {
    if (minimum < 100n) assert.throws(() => requireConfirmedMinimum(result, 100n));
    else requireConfirmedMinimum(result, 100n);
  }
}
for (const invalid of [0n, -1n]) {
  assert.throws(() => requireConfirmedMinimum({ tx: { amountOutMin: 100n } }, invalid));
  assert.throws(() => minimumFromQuote(invalid, 0, 50));
}
assert.equal(minimumFromQuote(1003n, 333, 50), 965n);
assert.equal(minimumFromQuote(9007199254740993n, 0, 0), 9007199254740993n);
assert.throws(() => minimumFromQuote(1n, 0, 50), /rounds to zero/);
for (const bps of [-1, 0.5, NaN, Infinity, 10000]) {
  assert.throws(() => minimumFromQuote(100000n, 0, bps));
  assert.throws(() => minimumFromQuote(100000n, bps, 50));
}
const confirmedMinimum = minimumFromQuote(100000n, 0, 50);
const refreshedMinimum = minimumFromQuote(95000n, 0, 50);
assert.equal(confirmedMinimum, 99500n);
assert.equal(refreshedMinimum, 94525n);
// Direct preparation and delegated build both use tx; delegated prepare uses raw.
for (const result of [
  { tx: { amountOutMin: refreshedMinimum } },
  { raw: { amount_out_min: String(refreshedMinimum) } },
]) {
  assert.throws(() => requireConfirmedMinimum(result, confirmedMinimum), /confirm the new minimum/);
}
assert.throws(() => requireConfirmedMinimum(
  { tx: { amountOutMin: 9007199254740992n } }, 9007199254740993n,
));

const originalFetch = globalThis.fetch;
const requests = [];
const from = "0x3600000000000000000000000000000000000000";
const target = "0x1111111111111111111111111111111111111111";
let responseRouter = EXECUTION_ROUTER;
let quoteCode = 200;
let poolId = `0x${"ab".repeat(32)}`;
globalThis.fetch = async input => {
  const url = new URL(String(input));
  assert.equal(url.origin + "/arc", API_BASE_URL);
  requests.push(url);
  const isStatus = url.pathname === "/arc/router/status";
  assert(isStatus || url.pathname === "/arc/router/find_routes", "Preview tried an execution endpoint");
  return new Response(JSON.stringify({ code: isStatus ? 200 : quoteCode, msg: "fixture", data: isStatus ? status : {
    request_id: "offline-fixture", quote_ts: 1, amount_in: url.searchParams.get("amount"), amount_out: "123",
    deviation_ratio: "", paths: [{
      pool: poolId, provider: "UNISWAPV4", adapter: target, token_in: from, token_out: target,
      direction: true, fee_rate: "0.003", amount_in: url.searchParams.get("amount"), amount_out: "123",
    }], contracts: { execution_router: responseRouter },
  } }), { headers: { "content-type": "application/json" } });
};
try {
  await assert.rejects(previewMainnetSwap(from, from, 1n));
  await assert.rejects(previewMainnetSwap(from, target, 0n));
  await assert.rejects(previewMainnetSwap("bad-address", target, 1n));
  await assert.rejects(previewMainnetSwap("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", target, 1n));
  assert.equal(requests.length, 0);
  const quote = await previewMainnetSwap(from, target, 9007199254740993n);
  assert.equal(quote.amount_in, "9007199254740993");
  assert.equal(quote.paths[0].pool, poolId, "V4 preview must preserve its bytes32 poolId");
  assert.equal(requests.at(-1).searchParams.get("by_amount_in"), "true");
  assert.equal(requests.at(-1).searchParams.get("v"), "1001500");
  poolId = `0x${"ab".repeat(31)}`;
  await assert.rejects(previewMainnetSwap(from, target, 1n));
  poolId = `0x${"ab".repeat(32)}`;
  responseRouter = target;
  await assert.rejects(previewMainnetSwap(from, target, 1n), /unexpected Execution Router/);
  responseRouter = EXECUTION_ROUTER;
  quoteCode = 5010;
  await assert.rejects(previewMainnetSwap(from, target, 1n), error => error.code === 5010);
} finally {
  globalThis.fetch = originalFetch;
}

const launchpad = await import(pathToFileURL(join(modules, "@masterpeach/launchpad-sdk/dist/index.js")).href);
const addressDoc = readFileSync(join(root, "skills/arc-launchpad/references/networks-and-contracts.md"), "utf8");
const contractFields = { LaunchFactory: "factory", "Current LaunchForwarder": "launchForwarder",
  FeeEscrow: "feeEscrow", PartnerRegistry: "partnerRegistry", BuybackVault: "buybackVault",
  GraduationCoordinator: "graduationCoordinator", MemeHook: "memeHook",
  HolderDistributorFactory: "holderDistributorFactory", "V4 PoolManager": "v4PoolManager", "Launchpad V4 Permit2": "permit2" };
for (const line of addressDoc.split("\n")) {
  const [label, testnet, mainnet] = line.split("|").slice(1, 4).map(value => value.trim().replaceAll("`", ""));
  if (!Object.hasOwn(contractFields, label)) continue;
  assert.equal(testnet, deployments.testnet.contracts[contractFields[label]]);
  assert.equal(mainnet, deployments.mainnet.contracts[contractFields[label]]);
}
for (const [network, chainId] of [["testnet", 5042002], ["mainnet", 5042]]) {
  const deployment = deployments[network];
  assert.equal(deployment.chainId, chainId);
  assert.equal(launchpad.launchpadCreationSpender(deployment, "createToken"), deployment.contracts.factory);
  assert.equal(launchpad.launchpadCreationSpender(deployment, "launchAndBuy"), deployment.contracts.launchForwarder);
  assert.notEqual(deployment.contracts.launchForwarder, deployment.contracts.legacyLaunchForwarder);
  assert(deployment.contracts.holderDistributorFactory);
}
assert.equal(deployments.mainnet.economics.quoteTokens.length, 1);
assert.equal(deployments.mainnet.economics.quoteTokens[0].address, from);
assert.equal(deployments.mainnet.economics.quoteTokens[0].decimals, 6);
assert.equal(launchpad.launchpadGraduateIsIdempotentSuccess("notGraduated"), false);
assert.equal(launchpad.launchpadGraduateIsIdempotentSuccess("swept"), true);
assert.equal(launchpad.MAX_SLIPPAGE_BPS, 5000);
assert.equal(launchpad.assertSlippage({ bps: 0 }), 0);
assert.equal(launchpad.assertSlippage({ bps: 2000 }), 2000); // SDK acceptance does not grant application approval.
assert.equal(launchpad.assertSlippage({ bps: 5000 }), 5000);
for (const bps of [-1, 0.5, NaN, Infinity, 5001, 10000]) {
  assert.throws(() => launchpad.applySlippageToMinimumOut(1000n, { bps }), launchpad.InvalidSlippageError);
}
for (const quote of [-1n, 0n, 1n]) {
  assert.throws(() => launchpad.applySlippageToMinimumOut(quote, { bps: 50 }), launchpad.InvalidSlippageError);
}
const submittedMinimum = launchpad.applySlippageToMinimumOut(1000n, { bps: 50 });
assert.equal(submittedMinimum, 995n);
assert.equal(launchpad.mulDivUp(submittedMinimum, 60n, 100n), 597n);
assert.equal(launchpad.mulDivUp(submittedMinimum, 59n, 100n), 588n);
assert(launchpad.mulDivUp(submittedMinimum, 59n, 100n) < 597n, "A lower partial fill must not retain the old displayed bound");
console.log("Typecheck and offline checks OK: Mainnet requests, V4 pool IDs, exact amounts, fee rounding, slippage bounds, confirmed minima, deployments, spenders and closing-buy scaling");
