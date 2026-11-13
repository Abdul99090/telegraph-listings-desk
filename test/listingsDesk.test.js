import test from "node:test";
import assert from "node:assert/strict";
import { ListingsDesk } from "../src/agent/listingsDesk.js";
import { listingApplicationFromSignal } from "../src/radar/signals.js";
import { SimulatedTelegraphClient, SpendCeilingError } from "../src/telegraph/client.js";

const cleanSignal = {
  tokenName: "Steady Yield Token",
  tokenSymbol: "SYT",
  chain: "bsc",
  contractAddress: "0x00000000000000000000000000000000000c1ean",
  deployer: "0x000000000000000000000000000000000000b001",
  metadata: {
    contractTraits: ["verified-source"],
    claimedSupply: "100000000",
    top10HolderPct: 18,
    circularVolumePct: 3,
    botFollowerPct: 9,
    deployerSanctioned: false,
  },
};

const rugSignal = {
  tokenName: "MoonPanda Inu",
  tokenSymbol: "MPAND",
  chain: "bsc",
  contractAddress: "0x0000000000000000000000000000000000rug001",
  deployer: "0x000000000000000000000000000000000000dead",
  metadata: {
    contractTraits: ["owner-can-mint", "upgradeable-proxy"],
    claimedSupply: "1000000000",
    top10HolderPct: 58,
    circularVolumePct: 64,
    botFollowerPct: 71,
    deployerSanctioned: false,
  },
};

test("clean listing is LISTed, with one receipt per intent and a cost line", async () => {
  const client = new SimulatedTelegraphClient();
  const desk = new ListingsDesk(client, { maxSpendPerRun: 100 });
  const outcome = await desk.evaluateListing(listingApplicationFromSignal(cleanSignal));

  assert.equal(outcome.verdict, "LIST");
  assert.equal(outcome.results.length, 5);
  assert.equal(client.purchases.length, 5);
  assert.ok(outcome.totalCost > 0);
  assert.ok(outcome.memo.receipts.every((r) => r && r.startsWith("sim-receipt-")));
  assert.equal(outcome.memo.network, "SIMULATED");
  assert.match(outcome.markdown, /Cost line/);
});

test("rug listing is REJECTed (audit hard veto + high weighted risk)", async () => {
  const client = new SimulatedTelegraphClient();
  const desk = new ListingsDesk(client, { maxSpendPerRun: 100 });
  const outcome = await desk.evaluateListing(listingApplicationFromSignal(rugSignal));

  assert.equal(outcome.verdict, "REJECT");
  const audit = outcome.results.find((r) => r.intent === "SMART_CONTRACT_AUDIT");
  assert.ok(audit.answer.riskScore >= 85);
});

test("sanctioned deployer is REJECTed even if everything else is clean", async () => {
  const client = new SimulatedTelegraphClient();
  const desk = new ListingsDesk(client, { maxSpendPerRun: 100 });
  const signal = structuredClone(cleanSignal);
  signal.metadata.deployerSanctioned = true;
  const outcome = await desk.evaluateListing(listingApplicationFromSignal(signal));

  assert.equal(outcome.verdict, "REJECT");
});

test("spend ceiling stops the run before any purchase", async () => {
  const client = new SimulatedTelegraphClient();
  const desk = new ListingsDesk(client, { maxSpendPerRun: 1 });
  await assert.rejects(
    () => desk.evaluateListing(listingApplicationFromSignal(cleanSignal)),
    SpendCeilingError,
  );
  assert.equal(client.purchases.length, 0);
});
