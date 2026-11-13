import { createHash } from "node:crypto";

/**
 * The desk's product: a listing risk memo with a cost line — the exact
 * shape Mission 01's worked example ends with ("Signed listing risk memo
 * with a cost line · 5 paid requests · 5 receipts").
 *
 * The memo carries a SHA-256 hash of its canonical JSON so the verdict
 * is tamper-evident. TODO before submission: sign `memoHash` with the
 * desk's operator key and embed the signature (see README → Next steps).
 */
export function buildMemo({ application, results, verdict, weightedRisk, generatedAt }) {
  const totalCost = results.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const core = {
    kind: "listing-risk-memo",
    mission: "exchange",
    goal: "Should we list this token?",
    subject: {
      tokenName: application.tokenName,
      tokenSymbol: application.tokenSymbol,
      chain: application.chain,
      contractAddress: application.contractAddress,
      deployer: application.deployer,
    },
    verdict,
    weightedRisk: weightedRisk === null ? null : Math.round(weightedRisk * 10) / 10,
    intents: results.map((r) => ({
      intent: r.intent,
      minerId: r.minerId,
      riskScore: r.answer.riskScore,
      scored: typeof r.answer.riskScore === "number",
      findings: r.answer.findings,
      receiptId: r.receipt?.id ?? null,
      cost: r.cost,
    })),
    paidRequests: results.length,
    receipts: results.map((r) => r.receipt?.id ?? null),
    totalCost,
    costUnit:
      results[0]?.receipt?.network === "telegraph-testnet" ? "USD (testnet USDC)" : "testnet credits",
    network: results[0]?.receipt?.network ?? "unknown",
    generatedAt,
  };
  const memoHash = createHash("sha256").update(JSON.stringify(core)).digest("hex");
  const memo = { ...core, memoHash, signature: null };

  const lines = [
    `# Listing risk memo — ${core.subject.tokenName} (${core.subject.tokenSymbol})`,
    ``,
    `- Contract: ${core.subject.contractAddress} on ${core.subject.chain}`,
    `- Deployer: ${core.subject.deployer ?? "unknown"}`,
    `- Verdict: **${verdict}** (weighted risk ${core.weightedRisk === null ? "n/a — no scored answers" : `${core.weightedRisk}/100`})`,
    `- Network evidence: ${core.network}`,
    ``,
    `## Intelligence bought`,
    ``,
    ...core.intents.flatMap((i) => [
      `### ${i.intent} — ${i.scored ? `risk ${i.riskScore}/100` : "unscored (miner answer carried no derivable risk score)"}`,
      `- Miner: ${i.minerId}`,
      ...i.findings.map((f) => `- ${f}`),
      ``,
    ]),
    `## Cost line`,
    ``,
    `${core.paidRequests} paid requests · ${core.receipts.filter(Boolean).length} receipts · total cost ${totalCost} ${core.costUnit}`,
    ``,
    `Receipts: ${core.receipts.join(", ")}`,
    ``,
    `Memo hash (SHA-256): ${memoHash}`,
  ];
  return { memo, markdown: lines.join("\n"), totalCost };
}
