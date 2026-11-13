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
    //    A single miner failing (a 400/503 for that miner, an answer
    //    with no derivable score) must not kill the run: the failure
    //    is recorded in the memo and the remaining intents complete.
    //    The one exception is PaymentRequiredError — an escrow that
    //    cannot pay means nothing can settle, so the run stops and
    //    the caller sees the node's exact refusal.
    const results = [];
    for (const { spec, miner } of plan) {
      try {
        const result = await this.client.askMiner(spec.name, miner.minerId, {
          question: spec.question,
          subject: {
            contractAddress: application.contractAddress,
            chain: application.chain,
            deployer: application.deployer,
            tokenName: application.tokenName,
            tokenSymbol: application.tokenSymbol,
          },
          metadata: application.metadata,
        });
        result.weight = spec.weight;
        results.push(result);
      } catch (err) {
        if (err?.name === "PaymentRequiredError") throw err;
        results.push({
          intent: spec.name,
          minerId: miner.minerId,
          weight: spec.weight,
          failed: true,
          answer: {
            riskScore: null,
            scored: false,
            findings: [`Purchase failed: ${err.message}`],
            raw: null,
          },
          receipt: { id: null, network: this.client.network ?? "unknown" },
          cost: 0,
        });
      }
    }

    // 4. Decide. Only SCORED answers feed the numbers: an intent whose
    //    miner returned no derivable score is recorded as unscored —
    //    it is not silently treated as zero risk. Hard vetoes first: a
    //    sanctions match, or a critical-grade audit risk, rejects
    //    regardless of the weighted average. With zero scored answers
    //    the desk never auto-clears a listing: REVIEW.
    const scored = results.filter((r) => typeof r.answer?.riskScore === "number");
    const byIntent = Object.fromEntries(results.map((r) => [r.intent, r]));
    const weightedRisk =
      scored.length > 0
        ? scored.reduce((sum, r) => sum + r.answer.riskScore * r.weight, 0) /
          scored.reduce((sum, r) => sum + r.weight, 0)
        : null;
    let verdict;
    if (
      (byIntent.SANCTIONS_SCREENING_MATCH?.answer.riskScore ?? -1) >= 90 ||
      (byIntent.SMART_CONTRACT_AUDIT?.answer.riskScore ?? -1) >= 85
    ) {
      verdict = "REJECT";
    } else if (weightedRisk === null) {
      verdict = "REVIEW";
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
