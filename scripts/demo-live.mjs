#!/usr/bin/env node
/**
 * Demo driver — the exact session recorded for video/demo.mp4.
 *
 *   node scripts/demo-live.mjs
 *
 * Steps, all live against the Telegraph testnet (beta 2):
 *   1. telegraph_account BEFORE  — wallet, escrow, spent_today
 *   2. the desk evaluates examples/sample-listing.json for real:
 *      plan from live rankings, five paid ask_miner purchases,
 *      verdict + memo (also written to out/memo-*)
 *   3. telegraph_account AFTER   — spent_today steps by the run's cost
 *   4. receipt recap             — every receipt hash from step 2
 *
 * Uses the product code paths (McpTelegraphClient + ListingsDesk),
 * not the probe client. Nothing here is simulated.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ListingsDesk } from "../src/agent/listingsDesk.js";
import { listingApplicationFromSignal } from "../src/radar/signals.js";
import { McpTelegraphClient } from "../src/telegraph/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function showAccount(label, a) {
  console.log(`\n--- telegraph_account (${label}) ---`);
  console.log(`wallet        : ${a.address}`);
  console.log(`network       : ${a.network} (Ethereum Sepolia, Telegraph beta 2)`);
  console.log(`wallet USDC   : ${a.wallet_usdc}   wallet ETH: ${a.wallet_eth}`);
  console.log(
    `escrow        : spendable ${a.escrow.spendable_usdc} / deposited ${a.escrow.deposited_usdc} / debt ${a.escrow.debt_usdc}`,
  );
  console.log(
    `limits        : max $${a.limits.max_per_ask_usd}/ask, $${a.limits.daily_usd}/day, spent today $${a.limits.spent_today_usd}`,
  );
}

const client = new McpTelegraphClient();
try {
  const before = await client.account();
  showAccount("BEFORE the run", before);
  await pause(2000);

  const signal = JSON.parse(await readFile(join(root, "examples", "sample-listing.json"), "utf8"));
  const application = listingApplicationFromSignal(signal);
  console.log(`\n--- Listing application received ---`);
  console.log(
    `${application.tokenName} (${application.tokenSymbol}) · contract ${application.contractAddress} · chain ${application.chain} · deployer ${application.deployer}`,
  );
  console.log(`The desk now plans from live rankings and buys five intents. Watch the receipts.`);
  await pause(2000);

  const desk = new ListingsDesk(client, {
    maxSpendPerRun: Number(process.env.TELEGRAPH_MAX_SPEND_PER_RUN ?? 100),
  });
  const outcome = await desk.evaluateListing(application);
  console.log("\n" + outcome.markdown);

  await mkdir(join(root, "out"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(join(root, "out", `memo-${stamp}.json`), JSON.stringify(outcome.memo, null, 2));
  await writeFile(join(root, "out", `memo-${stamp}.md`), outcome.markdown);
  await writeFile(
    join(root, "out", `run-${stamp}.json`),
    JSON.stringify({ application, results: outcome.results }, null, 2),
  );
  console.log(`\nMemo written to out/memo-${stamp}.{json,md}; full run evidence in out/run-${stamp}.json`);
  await pause(2000);

  const after = await client.account();
  showAccount("AFTER the run", after);
  console.log(
    `\nspent_today moved $${before.limits.spent_today_usd} -> $${after.limits.spent_today_usd} — the run's settled cost.`,
  );

  console.log(`\n--- Receipt recap (real Telegraph receipts, testnet) ---`);
  for (const r of outcome.results) {
    console.log(
      `${r.intent.padEnd(28)} miner ${String(r.minerId).padEnd(22)} cost $${r.cost ?? "?"}  receipt ${r.receipt?.id ?? "(none)"}`,
    );
  }
} finally {
  await client.close();
}
