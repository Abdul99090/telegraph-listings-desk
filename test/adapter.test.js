import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  McpTelegraphClient,
  TelegraphToolError,
  AnswerShapeError,
  deriveRiskScore,
  defaultIntentParams,
} from "../src/telegraph/client.js";
import { ListingsDesk } from "../src/agent/listingsDesk.js";
import { listingApplicationFromSignal } from "../src/radar/signals.js";

/** A client whose wallet check passes and whose callTool is stubbed — no network. */
async function stubClient(toolImpl, opts = {}) {
  const home = await mkdtemp(join(tmpdir(), "telegraph-test-"));
  await writeFile(join(home, "wallet.json"), "{}");
  const client = new McpTelegraphClient({ home, ...opts });
  client.callTool = toolImpl;
  return client;
}

const subject = {
  contractAddress: "0x0000000000000000000000000000000000rug001",
  chain: "bsc",
  deployer: "0x000000000000000000000000000000000000dead",
  tokenName: "MoonPanda Inu",
  tokenSymbol: "MPAND",
};

test("defaultIntentParams supplies the params each live intent requires", () => {
  assert.deepEqual(
    defaultIntentParams("ONCHAIN_METRIC_VERIFY_GENERAL", subject, {}, 24000000),
    {
      address: subject.deployer,
      block: 24000000,
      chain: "ethereum",
      metric: "balance",
    },
  );
  // Without a block number the ONCHAIN params stay empty rather than guessing.
  assert.deepEqual(defaultIntentParams("ONCHAIN_METRIC_VERIFY_GENERAL", subject, {}, null), {});
  assert.deepEqual(defaultIntentParams("WASH_TRADING_DETECTION_GENERAL", subject, {}), {
    subject: subject.contractAddress,
  });
  assert.deepEqual(defaultIntentParams("SOCIAL_BOT_DETECTION_GENERAL", subject, {}), {
    account: "MoonPandaInu",
  });
  assert.deepEqual(
    defaultIntentParams("SOCIAL_BOT_DETECTION_GENERAL", subject, { socialAccount: "@real" }),
    { account: "@real" },
  );
  assert.deepEqual(defaultIntentParams("SANCTIONS_SCREENING_MATCH_GENERAL", subject, {}), {
    name: "MoonPanda Inu",
  });
  assert.deepEqual(defaultIntentParams("SMART_CONTRACT_AUDIT_GENERAL", subject, {}), {});
});

test("deriveRiskScore maps only what the miner returned", () => {
  // Sanctions facts (session E6 shape).
  assert.equal(
    deriveRiskScore("SANCTIONS_SCREENING_MATCH", { matched: true, match_score: null }).riskScore,
    100,
  );
  assert.equal(
    deriveRiskScore("SANCTIONS_SCREENING_MATCH", { matched: false, match_score: 0.12 }).riskScore,
    12,
  );
  assert.equal(
    deriveRiskScore("SANCTIONS_SCREENING_MATCH", { matched: false, match_score: null }).riskScore,
    0,
  );
  // Social fraction (answer_fields: bot_score 0–1).
  assert.equal(
    deriveRiskScore("SOCIAL_BOT_DETECTION", { bot_score: 0.73 }).riskScore,
    73,
  );
  // Wash percentage, and the miner-stated summary score (session E2 shape).
  assert.equal(
    deriveRiskScore("WASH_TRADING_DETECTION", { wash_volume_pct: 41.2 }).riskScore,
    41.2,
  );
  assert.equal(
    deriveRiskScore("WASH_TRADING_DETECTION", {
      wash_volume_pct: null,
      summary: "WETH shows a ELEVATED wash-trading risk (score 0.53): 2,500 transfers.",
    }).riskScore,
    53,
  );
  // Audit severity evidence.
  assert.equal(
    deriveRiskScore("SMART_CONTRACT_AUDIT", {
      findings: ["CRITICAL: owner can mint.", "LOW: typo in comment."],
    }).riskScore,
    48,
  );
  // A prose-only answer (the GHSA-style audit answer that used to abort
  // the run) is unscored, not zero and not an exception.
  const prose = deriveRiskScore("SMART_CONTRACT_AUDIT", {
    summary: "Reviewed the public advisory database; see the attached report.",
  });
  assert.equal(prose.scored, false);
  assert.equal(prose.riskScore, null);
  // The audit miner's real shape is a bare list of GHSA advisories
  // (session F2) — other software's CVEs are not this contract's risk.
  const list = deriveRiskScore("SMART_CONTRACT_AUDIT", [
    { cve_id: "CVE-2026-128077", cvss: { score: 6.5 } },
  ]);
  assert.equal(list.scored, false);
});

test("askMiner returns an unscored settled answer instead of throwing", async () => {
  const client = await stubClient(async (name) => {
    assert.equal(name, "telegraph_ask_miner");
    return {
      answer: { summary: "Advisory review attached; no numeric score field." },
      cost_usd: 0.01,
      payment: { price_usd: 0.01, receipt: { receipt_hash: "0xreceipt1" } },
      miner: "GHSA Audit Advisories (id 151007)",
    };
  });
  const r = await client.askMiner("SMART_CONTRACT_AUDIT", "sca-ghsa", {
    question: "Audit it.",
    subject,
    metadata: {},
  });
  assert.equal(r.answer.scored, false);
  assert.equal(r.answer.riskScore, null);
  assert.equal(r.receipt.id, "0xreceipt1");
  assert.equal(r.cost, 0.01);
});

test("askMiner with strictScores restores the AnswerShapeError throw", async () => {
  const client = await stubClient(
    async () => ({ answer: { summary: "prose only" }, cost_usd: 0.01 }),
    { strictScores: true },
  );
  await assert.rejects(
    () => client.askMiner("SMART_CONTRACT_AUDIT", "sca-ghsa", { subject, metadata: {} }),
    AnswerShapeError,
  );
});

test("askMiner falls back to telegraph_ask on 503 no_compatible_miner", async () => {
  const seen = [];
  const client = await stubClient(async (name) => {
    seen.push(name);
    if (name === "telegraph_ask_miner") {
      throw new TelegraphToolError(
        name,
        JSON.stringify({
          status: 503,
          error: "no_compatible_miner",
          message: "miner chainsight-oracle cannot take this request's params",
        }),
      );
    }
    return {
      answer: { name: "MoonPanda Inu", matched: false, matches: [], lists: ["ofac-sdn"], match_score: null },
      cost_usd: 0.01,
      payment: { price_usd: 0.01, receipt: { receipt_hash: "0xreceipt2" } },
      miner: "ChainSight — Universal Intelligence & Data Oracle (id 302)",
    };
  });
  const r = await client.askMiner("SANCTIONS_SCREENING_MATCH", "chainsight-oracle", {
    question: "Screen it.",
    subject,
    metadata: {},
  });
  assert.deepEqual(seen, ["telegraph_ask_miner", "telegraph_ask"]);
  assert.equal(r.answer.riskScore, 0);
  assert.match(r.servedBy, /ChainSight/);
  assert.equal(r.receipt.id, "0xreceipt2");
});

/** Minimal desk-level stub: per-intent behaviour without any client internals. */
class StubDeskClient {
  constructor(behaviour) {
    this.network = "stub";
    this.behaviour = behaviour;
  }
  async getRanking() {
    return [{ minerId: "stub-miner", rank: 1, price: 1 }];
  }
  async askMiner(intent) {
    return this.behaviour(intent);
  }
}

const application = () =>
  listingApplicationFromSignal({
    tokenName: "MoonPanda Inu",
    tokenSymbol: "MPAND",
    chain: "bsc",
    contractAddress: subject.contractAddress,
    deployer: subject.deployer,
    metadata: {},
  });

const scoredResult = (intent, riskScore) => ({
  intent,
  minerId: "stub-miner",
  answer: { riskScore, scored: true, findings: ["ok"], raw: {} },
  receipt: { id: `rcpt-${intent}`, network: "stub" },
  cost: 1,
});
const unscoredResult = (intent) => ({
  intent,
  minerId: "stub-miner",
  answer: { riskScore: null, scored: false, findings: ["prose only"], raw: {} },
  receipt: { id: `rcpt-${intent}`, network: "stub" },
  cost: 1,
});

test("desk completes a run when some answers are unscored or fail", async () => {
  const client = new StubDeskClient((intent) => {
    if (intent === "SMART_CONTRACT_AUDIT") return unscoredResult(intent);
    if (intent === "ONCHAIN_METRIC_VERIFY") throw new Error("400 invalid_params");
    return scoredResult(intent, 10);
  });
  const desk = new ListingsDesk(client, { maxSpendPerRun: 100 });
  const outcome = await desk.evaluateListing(application());
  assert.equal(outcome.results.length, 5);
  assert.equal(outcome.verdict, "LIST"); // scored subset is uniformly low-risk
  assert.equal(outcome.weightedRisk, 10);
  assert.match(outcome.markdown, /unscored/);
});

test("desk returns REVIEW (never LIST) when no answer is scored", async () => {
  const client = new StubDeskClient((intent) => unscoredResult(intent));
  const desk = new ListingsDesk(client, { maxSpendPerRun: 100 });
  const outcome = await desk.evaluateListing(application());
  assert.equal(outcome.verdict, "REVIEW");
  assert.equal(outcome.weightedRisk, null);
});
