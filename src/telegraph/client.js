/**
 * Telegraph client — the desk's only door to the network.
 *
 * The official machine interface is the Telegraph MCP server
 * (@telegraphprotocol/telegraph-protocol-mcp, v2.0.0). VERIFIED LIVE
 * 14 Nov 2026 (first-integration milestone, docs/INTEGRATION-LOG.md;
 * full schemas in docs/MCP-TOOLS.md):
 *
 * - There is NO hosted HTTP endpoint and NO API key. The server runs
 *   locally over stdio: `npx -y @telegraphprotocol/telegraph-protocol-mcp`.
 *   It holds a dedicated wallet (~/.telegraph/wallet.json, created by
 *   the official `setup` command) and signs escrow authorisations
 *   itself; the agent never sees the key.
 * - Node: https://devnode.telegraphprotocol.com (beta 2), chain
 *   Ethereum Sepolia (eip155:11155111), escrow-paid asks (~$0.01).
 * - Tools: telegraph_docs (topics are kebab-case: "getting-started",
 *   "payments", "intents-and-ranking", "troubleshooting"),
 *   telegraph_ask, telegraph_ask_miner (miner REQUIRED; question /
 *   intent / params, or endpoint / method / payload for direct calls),
 *   telegraph_find_intents, telegraph_intent, telegraph_find_miners
 *   (carries price_usd; telegraph_ranking does NOT carry prices),
 *   telegraph_ranking, telegraph_account, and telegraph_deposit
 *   ({ amount_usd }) — the last only when the server is started with
 *   TELEGRAPH_ALLOW_AGENT_DEPOSIT=1.
 * - The Mission 01 catalogue names (SMART_CONTRACT_AUDIT, …) have ZERO
 *   miners live; the served intents are the *_GENERAL variants
 *   (SMART_CONTRACT_AUDIT_GENERAL, 18 miners). LIVE_INTENT_MAP below
 *   performs that translation.
 * - An ask the escrow cannot cover is NOT a tool error: it returns a
 *   normal result whose JSON body has status 402 ("payment required").
 *   McpTelegraphClient surfaces that as PaymentRequiredError.
 *
 * SimulatedTelegraphClient provides deterministic offline Providers so
 * the desk logic, memo and tests run end-to-end without the network.
 * Simulated receipts are watermarked network: "SIMULATED" and must
 * never be presented as real Telegraph evidence (H2 Rules §5).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export class NotRegisteredError extends Error {
  constructor() {
    super(
      "Telegraph wallet missing (~/.telegraph/wallet.json). Run the official setup once: " +
        "`npx -y @telegraphprotocol/telegraph-protocol-mcp setup` — it creates a dedicated " +
        "testnet wallet. Refusing to run live mode without it.",
    );
    this.name = "NotRegisteredError";
  }
}

export class TelegraphToolError extends Error {
  constructor(tool, text) {
    super(`Telegraph tool ${tool} failed: ${text}`);
    this.name = "TelegraphToolError";
    this.tool = tool;
    this.text = text;
  }
}

export class PaymentRequiredError extends Error {
  constructor(body) {
    super(`Telegraph payment required: ${body?.reason ?? "escrow cannot cover this ask"}`);
    this.name = "PaymentRequiredError";
    this.body = body;
  }
}

export class AnswerShapeError extends Error {
  constructor(intent, answer) {
    super(
      `Miner answer for ${intent} carries no numeric risk score the desk can use ` +
        `(keys: ${answer && typeof answer === "object" ? Object.keys(answer).join(", ") : typeof answer}). ` +
        "Refusing to invent one — inspect the raw answer and extend the adapter.",
    );
    this.name = "AnswerShapeError";
    this.answer = answer;
  }
}

/**
 * Mission 01 catalogue name -> live beta-2 intent name.
 * Verified 14 Nov 2026 via telegraph_find_intents (136 intents).
 */
export const LIVE_INTENT_MAP = {
  SMART_CONTRACT_AUDIT: "SMART_CONTRACT_AUDIT_GENERAL",
  SECURITY_REVIEW: "SECURITY_REVIEW_GENERAL",
  ONCHAIN_METRIC_VERIFY: "ONCHAIN_METRIC_VERIFY_GENERAL",
  TOKEN_TOTAL_SUPPLY_VERIFY: "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL",
  SANCTIONS_SCREENING_MATCH: "SANCTIONS_SCREENING_MATCH_GENERAL",
  SOCIAL_BOT_DETECTION: "SOCIAL_BOT_DETECTION_GENERAL",
  WASH_TRADING_DETECTION: "WASH_TRADING_DETECTION_GENERAL",
  LIQUIDITY_DEPTH_VERIFY: "LIQUIDITY_DEPTH_VERIFY_GENERAL",
};

export function toLiveIntent(name) {
  return LIVE_INTENT_MAP[name] ?? name;
}

export class SpendCeilingError extends Error {
  constructor(planned, ceiling) {
    super(`Planned intelligence spend ${planned} exceeds per-run ceiling ${ceiling}.`);
    this.name = "SpendCeilingError";
    this.planned = planned;
    this.ceiling = ceiling;
  }
}

/**
 * Live client speaking MCP JSON-RPC over stdio to the official
 * Telegraph MCP server (spawned on demand). The server owns the
 * wallet and the escrow signing; this client only shapes the desk's
 * operations onto the verified tool schemas (docs/MCP-TOOLS.md).
 */
export class McpTelegraphClient {
  constructor({ home, env = {} } = {}) {
    const telegraphHome =
      home ?? env.TELEGRAPH_HOME ?? process.env.TELEGRAPH_HOME ?? join(homedir(), ".telegraph");
    if (!env.TELEGRAPH_PRIVATE_KEY && !process.env.TELEGRAPH_PRIVATE_KEY) {
      if (!existsSync(join(telegraphHome, "wallet.json"))) throw new NotRegisteredError();
    }
    this.telegraphHome = telegraphHome;
    this.extraEnv = env;
    this.network = "telegraph-testnet";
    this._child = null;
    this._ready = null;
    this._id = 0;
    this._pending = new Map();
    this._buf = "";
    this._prices = new Map(); // liveIntent -> Map(minerId -> price_usd)
  }

  async _connect() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      const child = spawn("npx", ["-y", "@telegraphprotocol/telegraph-protocol-mcp"], {
        env: {
          ...process.env,
          ...this.extraEnv,
          // The desk's deposit() is an explicit operation, so opt in to
          // the agent-deposit tool the server otherwise withholds.
          TELEGRAPH_ALLOW_AGENT_DEPOSIT: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this._child = child;
      child.stdout.on("data", (chunk) => {
        this._buf += chunk.toString();
        let idx;
        while ((idx = this._buf.indexOf("\n")) >= 0) {
          const line = this._buf.slice(0, idx).trim();
          this._buf = this._buf.slice(idx + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.id !== undefined && this._pending.has(msg.id)) {
            this._pending.get(msg.id)(msg);
            this._pending.delete(msg.id);
          }
        }
      });
      const init = await this._request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "telegraph-listings-desk", version: "0.1.0" },
      });
      if (init.error) {
        throw new Error(`Telegraph MCP initialize failed: ${JSON.stringify(init.error)}`);
      }
      this.serverInfo = init.result?.serverInfo ?? null;
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n",
      );
      return init.result;
    })();
    return this._ready;
  }

  _request(method, params, timeoutMs = 120000) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Telegraph MCP timeout after ${timeoutMs}ms waiting for ${method}`));
      }, timeoutMs);
      this._pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this._child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  /** Raw tools/call with the live result contract: text content, JSON-parsed when possible. */
  async callTool(name, args = {}) {
    await this._connect();
    const res = await this._request("tools/call", { name, arguments: args });
    if (res.error) {
      throw new Error(`Telegraph MCP error in ${name}: ${JSON.stringify(res.error)}`);
    }
    const text = res.result?.content?.find((c) => c.type === "text")?.text ?? "";
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* plain-text result (e.g. telegraph_docs markdown) */
    }
    // A payment refusal arrives as a 402 JSON body — for telegraph_ask as
    // a normal result, for telegraph_ask_miner flagged isError. Either
    // way it is a payment state, not a tool failure: hand it to the
    // caller, which surfaces PaymentRequiredError.
    if (parsed && typeof parsed === "object" && parsed.status === 402) return parsed;
    if (res.result?.isError) throw new TelegraphToolError(name, text);
    return parsed;
  }

  /**
   * Rankings for an Intent as the desk consumes them:
   * [{ minerId, rank, price, score, status }], best first.
   * Prices live on telegraph_find_miners (price_usd); telegraph_ranking
   * carries no prices, so planning/pricing reads find_miners.
   */
  async getRanking(intent) {
    const live = toLiveIntent(intent);
    const r = await this.callTool("telegraph_find_miners", { intent: live, limit: 25 });
    const miners = Array.isArray(r?.miners) ? r.miners : [];
    const cache = new Map();
    const ranking = miners
      .map((m) => {
        const minerId = m.slug ?? String(m.id);
        cache.set(minerId, m.price_usd);
        return {
          minerId,
          minerNumericId: m.id,
          rank: m.rank,
          price: m.price_usd,
          score: m.score,
          status: m.status,
        };
      })
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    this._prices.set(live, cache);
    return ranking;
  }

  /** Epoch ranking exactly as the network reports it (no prices). */
  async getEpochRanking(intent) {
    return this.callTool("telegraph_ranking", { intent: toLiveIntent(intent) });
  }

  /**
   * The paid machine-to-machine request. Returns
   * { intent, liveIntent, minerId, answer, receipt, cost }.
   * Throws PaymentRequiredError when the escrow cannot cover the ask
   * (the server reports that as a 402 body, not a tool error), and
   * AnswerShapeError when a successful answer carries no usable risk
   * score — the desk never runs on an invented number.
   */
  async askMiner(intent, minerId, payload = {}) {
    const live = toLiveIntent(intent);
    const subject = payload.subject ?? {};
    const subjectLine = [
      subject.contractAddress ? `Contract: ${subject.contractAddress}` : null,
      subject.chain ? `Chain: ${subject.chain}` : null,
      subject.deployer ? `Deployer: ${subject.deployer}` : null,
    ]
      .filter(Boolean)
      .join(". ");
    const question = [payload.question ?? `Evaluate this listing subject for intent ${live}.`, subjectLine]
      .filter(Boolean)
      .join(" ");
    const args = { miner: minerId, intent: live, question };
    if (payload.params) args.params = payload.params;
    const r = await this.callTool("telegraph_ask_miner", args);
    if (r && typeof r === "object" && r.status === 402) throw new PaymentRequiredError(r);

    const raw = r?.answer ?? r;
    const riskScore = pickRiskScore(raw);
    if (riskScore === null) throw new AnswerShapeError(intent, raw);
    const findings = pickFindings(raw);
    const cost =
      r?.payment?.price_usd ?? r?.cost ?? r?.price_usd ?? this._prices.get(live)?.get(minerId) ?? null;
    return {
      intent,
      liveIntent: live,
      minerId,
      answer: { riskScore, findings, raw },
      receipt: {
        id: r?.receipt?.id ?? r?.receipt_id ?? r?.id ?? null,
        network: this.network,
        raw: r,
      },
      cost,
    };
  }

  async account() {
    return this.callTool("telegraph_account", {});
  }

  /** Move wallet USDC into escrow. amount is in USD (tool arg: amount_usd). */
  async deposit(amountUsd) {
    return this.callTool("telegraph_deposit", { amount_usd: amountUsd });
  }

  async close() {
    this._child?.kill("SIGTERM");
    this._child = null;
    this._ready = null;
  }
}

function pickRiskScore(raw) {
  if (!raw || typeof raw !== "object") return null;
  for (const key of ["riskScore", "risk_score", "risk"]) {
    const v = raw[key];
    if (typeof v === "number" && v >= 0 && v <= 100) return v;
  }
  return null;
}

function pickFindings(raw) {
  if (Array.isArray(raw?.findings)) return raw.findings.map(String);
  if (typeof raw?.findings === "string") return [raw.findings];
  if (typeof raw?.summary === "string") return [raw.summary];
  if (typeof raw?.verdict === "string") return [raw.verdict];
  return ["Miner returned no findings text."];
}

/**
 * Deterministic offline stand-in for the network. The "Miners" here are
 * fixtures that score a listing application from its declared metadata —
 * they exist so the desk's buying/aggregation/memo logic is real and
 * testable before registration. They are NOT intelligence and their
 * receipts are watermarked SIMULATED.
 */
export class SimulatedTelegraphClient {
  constructor() {
    this.network = "SIMULATED";
    this.purchases = [];
    this._prices = {
      SMART_CONTRACT_AUDIT: 12,
      ONCHAIN_METRIC_VERIFY: 6,
      WASH_TRADING_DETECTION: 8,
      SOCIAL_BOT_DETECTION: 5,
      SANCTIONS_SCREENING_MATCH: 4,
    };
  }

  async getRanking(intent) {
    const price = this._prices[intent] ?? 5;
    return [1, 2, 3].map((rank) => ({
      minerId: `sim-miner-${intent.toLowerCase()}-${rank}`,
      rank,
      price: price + (rank - 1) * 2,
    }));
  }

  async askMiner(intent, minerId, payload) {
    const meta = payload.metadata ?? {};
    const { riskScore, findings } = scoreIntent(intent, meta);
    const cost = (await this.getRanking(intent)).find((m) => m.minerId === minerId).price;
    const receipt = {
      id: `sim-receipt-${this.purchases.length + 1}-${intent}`,
      intent,
      minerId,
      cost,
      network: this.network,
      settled: false, // simulated: no real settlement exists
    };
    const result = {
      intent,
      minerId,
      answer: { riskScore, findings, summary: findings[0] ?? "No findings." },
      receipt,
      cost,
    };
    this.purchases.push(result);
    return result;
  }
}

/** Fixture scoring rules — transparent on purpose (see class docstring). */
function scoreIntent(intent, meta) {
  switch (intent) {
    case "SMART_CONTRACT_AUDIT": {
      const traits = meta.contractTraits ?? [];
      const findings = [];
      let risk = 5;
      if (traits.includes("owner-can-mint")) {
        findings.push("CRITICAL: owner can mint new supply at will.");
        risk += 55;
      }
      if (traits.includes("upgradeable-proxy")) {
        findings.push("HIGH: upgradeable proxy — implementation can change after listing.");
        risk += 25;
      }
      if (traits.includes("blacklist")) {
        findings.push("MEDIUM: owner-managed blacklist can freeze holders.");
        risk += 15;
      }
      if (traits.includes("verified-source")) {
        findings.push("Source code is verified and readable.");
        risk -= 5;
      }
      if (findings.length === 0) findings.push("No material contract findings.");
      return { riskScore: clamp(risk), findings };
    }
    case "ONCHAIN_METRIC_VERIFY": {
      const top10 = meta.top10HolderPct ?? 0;
      const findings = [
        `Top-10 holders control ${top10}% of supply.`,
        `Claimed supply ${meta.claimedSupply ?? "?"} matches on-chain total supply.`,
      ];
      return { riskScore: clamp(Math.round(top10 * 0.9)), findings };
    }
    case "WASH_TRADING_DETECTION": {
      const pct = meta.circularVolumePct ?? 0;
      return {
        riskScore: clamp(Math.round(pct * 1.2)),
        findings: [`${pct}% of early volume is circular between affiliated wallets.`],
      };
    }
    case "SOCIAL_BOT_DETECTION": {
      const pct = meta.botFollowerPct ?? 0;
      return {
        riskScore: clamp(Math.round(pct * 0.8)),
        findings: [`Estimated ${pct}% of social followers are coordinated/bot accounts.`],
      };
    }
    case "SANCTIONS_SCREENING_MATCH": {
      const hit = meta.deployerSanctioned === true;
      return {
        riskScore: hit ? 100 : 0,
        findings: [
          hit
            ? "MATCH: deployer address appears on a consolidated sanctions list."
            : "No sanctions-list match for deployer or known counterparties.",
        ],
      };
    }
    default:
      return { riskScore: 0, findings: ["Intent not simulated."] };
  }
}

function clamp(n) {
  return Math.max(0, Math.min(100, n));
}
