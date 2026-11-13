/**
 * Intent selection for Mission 01 (Exchange) — the autonomous listings desk.
 *
 * Source: catalog/missions.json in github.com/telegraphprotocol/bounties
 * (mission "exchange", core_intents) and docs/NETWORK_MAP.md in the same
 * repo. Intents are shared, network-wide: the same Miners serve them and
 * the same Evaluators score them for every mission. Each Intent is ranked
 * separately, so the desk buys several and combines the answers.
 */
export const MISSION = {
  id: "exchange",
  name: "Mission 01: Exchange",
  track: "Track 03 — Apps & Agents",
  goal: "Should we list this token?",
};

/** Intents the desk buys for every listing application, in order. */
export const DESK_INTENTS = [
  {
    name: "SMART_CONTRACT_AUDIT",
    kind: "Hybrid",
    targetLatency: "< 8s",
    weight: 0.35,
    question:
      "Inspect the token contract source/bytecode for reentrancy, access-control, mint/pause/blacklist powers, proxy upgradeability and integer issues. Return findings with severities.",
  },
  {
    name: "ONCHAIN_METRIC_VERIFY",
    kind: "Deterministic",
    targetLatency: "< 2s",
    weight: 0.25,
    question:
      "Verify on-chain state directly: total supply vs. claimed supply, holder concentration (top-10 share), deployer history and current balances.",
  },
  {
    name: "WASH_TRADING_DETECTION",
    kind: "Hybrid",
    targetLatency: "< 4s",
    weight: 0.2,
    question:
      "Analyse the DEX transaction graph for circular transfers between affiliated wallets and other signs of artificial volume.",
  },
  {
    name: "SOCIAL_BOT_DETECTION",
    kind: "Judgment",
    targetLatency: "< 2s",
    weight: 0.1,
    question:
      "Classify the project's public social accounts for coordinated inauthentic behaviour: post-frequency anomalies and follower-graph clusters.",
  },
  {
    name: "SANCTIONS_SCREENING_MATCH",
    kind: "Hybrid",
    targetLatency: "< 500ms",
    weight: 0.1,
    question:
      "Screen the deployer and known counterparty addresses against OFAC, EU and UN consolidated sanctions lists.",
  },
];

/** All core intents of Mission 01 per the official catalogue (for reference). */
export const MISSION_01_CORE_INTENTS = [
  "SMART_CONTRACT_AUDIT",
  "SECURITY_REVIEW",
  "ONCHAIN_METRIC_VERIFY",
  "TOKEN_TOTAL_SUPPLY_VERIFY",
  "SANCTIONS_SCREENING_MATCH",
  "SOCIAL_BOT_DETECTION",
  "WASH_TRADING_DETECTION",
  "LIQUIDITY_DEPTH_VERIFY",
];
