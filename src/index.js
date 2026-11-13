import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ListingsDesk } from "./agent/listingsDesk.js";
import { listingApplicationFromSignal } from "./radar/signals.js";
import { McpTelegraphClient, SimulatedTelegraphClient } from "./telegraph/client.js";

/**
 * CLI demo for the listings desk.
 *
 *   node src/index.js --simulate [--input examples/sample-listing.json]
 *   node src/index.js --live     [--input examples/sample-listing.json]
 *
 * --live spawns the official Telegraph MCP server
 * (@telegraphprotocol/telegraph-protocol-mcp, stdio) and uses the
 * dedicated wallet from its `setup` command (~/.telegraph/wallet.json).
 * Without that wallet the client refuses to start — there is no silent
 * fallback from live to simulated, because H2 Rules §5 requires
 * accurate claims about which network produced the evidence.
 */
const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const inputIdx = process.argv.indexOf("--input");
const inputPath =
  inputIdx >= 0 ? process.argv[inputIdx + 1] : join(here, "..", "examples", "sample-listing.json");

const signal = JSON.parse(await readFile(inputPath, "utf8"));
const application = listingApplicationFromSignal(signal);

let client;
if (args.has("--live")) {
  client = new McpTelegraphClient();
  console.log("LIVE MODE — Telegraph testnet (beta 2, Ethereum Sepolia) via official MCP server");
} else {
  client = new SimulatedTelegraphClient();
  console.log("SIMULATION MODE — offline fixture Miners, receipts are NOT network evidence");
}

const desk = new ListingsDesk(client, {
  maxSpendPerRun: Number(process.env.TELEGRAPH_MAX_SPEND_PER_RUN ?? 100),
});
const outcome = await desk.evaluateListing(application);

console.log("\n" + outcome.markdown);

await mkdir(join(here, "..", "out"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(join(here, "..", "out", `memo-${stamp}.json`), JSON.stringify(outcome.memo, null, 2));
await writeFile(join(here, "..", "out", `memo-${stamp}.md`), outcome.markdown);
console.log(`\nMemo written to out/memo-${stamp}.{json,md}`);
