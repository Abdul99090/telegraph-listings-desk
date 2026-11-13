import { DESK_INTENTS } from "../telegraph/intents.js";
import { SpendCeilingError } from "../telegraph/client.js";
import { buildMemo } from "../memo.js";

/**
 * The autonomous listings desk (Track 03, Mission 01: Exchange).
 *
 * One run = one listing decision, following the anatomy in the H2
 * "How it works" page:
 *
 *   Goal → Intelligence → Route → Receipt → Outcome
 *
 * 1. PLAN    the Intents a listing decision needs (DESK_INTENTS).
 * 2. PRICE   read each Intent's ranking, take the #1 Miner, and check
 *            the planned spend against the per-run ceiling BEFORE
 *            buying anything (safe handling, H2 Rules §5).
 * 3. BUY     one genuinely autonomous machine-to-machine purchase per
 *            Intent via telegraph_ask_miner; every answer returns with
 *            a receipt and a settled cost.
 * 4. DECIDE  weighted risk aggregation with two hard vetoes.
 * 5. REPORT  a signed-hash memo with the cost line.
 */
export class ListingsDesk {
  constructor(client, { maxSpendPerRun = 100 } = {}) {
    this.client = client;
    this.maxSpendPerRun = maxSpendPerRun;
  }

  async evaluateListing(application) {
    // 1+2. Plan and price the run before spending anything.
    const plan = [];
    for (const spec of DESK_INTENTS) {
      const ranking = await this.client.getRanking(spec.name);
      if (!ranking?.length) throw new Error(`No Miners ranked for intent ${spec.name}`);
      plan.push({ spec, miner: ranking[0] });
    }
    const planned = plan.reduce((sum, p) => sum + (p.miner.price ?? 0), 0);
    if (planned > this.maxSpendPerRun) throw new SpendCeilingError(planned, this.maxSpendPerRun);

    // 3. Buy the intelligence — one paid request per Intent.
    const results = [];
    for (const { spec, miner } of plan) {
      const result = await this.client.askMiner(spec.name, miner.minerId, {
        question: spec.question,
        subject: {
          contractAddress: application.contractAddress,
          chain: application.chain,
          deployer: application.deployer,
        },
        metadata: application.metadata,
      });
      result.weight = spec.weight;
      results.push(result);
    }

    // 4. Decide. Hard vetoes first: a sanctions match, or a critical-grade
    //    audit risk, rejects regardless of the weighted average.
    const byIntent = Object.fromEntries(results.map((r) => [r.intent, r]));
    const weightedRisk =
      results.reduce((sum, r) => sum + r.answer.riskScore * r.weight, 0) /
      results.reduce((sum, r) => sum + r.weight, 0);
    let verdict;
    if (
      byIntent.SANCTIONS_SCREENING_MATCH.answer.riskScore >= 90 ||
      byIntent.SMART_CONTRACT_AUDIT.answer.riskScore >= 85
    ) {
      verdict = "REJECT";
    } else {
      verdict = weightedRisk >= 45 ? "REJECT" : weightedRisk >= 25 ? "REVIEW" : "LIST";
    }

    // 5. Report.
    const { memo, markdown, totalCost } = buildMemo({
      application,
      results,
      verdict,
      weightedRisk,
      generatedAt: new Date().toISOString(),
    });
    return { verdict, weightedRisk, totalCost, results, memo, markdown };
  }
}
