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
 * - Three of the desk's intents REQUIRE params (telegraph_intent;
 *   sessions E2/E3): ONCHAIN_METRIC_VERIFY_GENERAL needs
 *   { address, block } (+ chain/metric), SOCIAL_BOT_DETECTION_GENERAL
 *   needs { account }, SANCTIONS_SCREENING_MATCH_GENERAL needs
 *   { name }, WASH_TRADING_DETECTION_GENERAL takes { subject }.
 *   defaultIntentParams() builds them from the listing subject.
 * - A miner can refuse the params it is handed: the #1 sanctions
 *   miner answered 503 no_compatible_miner to ask_miner with `name`
 *   (sessions E4/E5); the node-routed telegraph_ask settled the same
 *   screening (session E6). askMiner falls back accordingly.
 * - Settled answers carry intent-shaped fields, not a uniform risk
 *   score (sessions E2/E4/E6). deriveRiskScore() maps ONLY what the
 *   miner itself returned onto 0–100; when nothing is derivable the
 *   answer is reported unscored instead of aborting the desk run
 *   (the session-2 AnswerShapeError behaviour) — see askMiner.
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
 * Parse the JSON body a TelegraphToolError carries, when it has one.
 * The node reports protocol-level refusals (400 invalid_params,
 * 503 no_compatible_miner) as an isError result whose text IS the
 * JSON body; callTool surfaces those as TelegraphToolError.
 */
export function parseToolErrorBody(err) {
  const text = err?.text ?? err?.message ?? "";
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start));
      } catch {
        /* not a JSON body */
      }
    }
  }
  return null;
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
  constructor({ home, env = {}, strictScores = false, ethRpcUrls } = {}) {
    const telegraphHome =
      home ?? env.TELEGRAPH_HOME ?? process.env.TELEGRAPH_HOME ?? join(homedir(), ".telegraph");
    if (!env.TELEGRAPH_PRIVATE_KEY && !process.env.TELEGRAPH_PRIVATE_KEY) {
      if (!existsSync(join(telegraphHome, "wallet.json"))) throw new NotRegisteredError();
    }
    this.telegraphHome = telegraphHome;
    this.extraEnv = env;
    // strictScores: true restores the pre-adapter behaviour of
    // throwing AnswerShapeError when a settled answer carries no
    // derivable risk score. Default false: the answer is returned
    // unscored and the desk decides with the intents that did score.
    this.strictScores = strictScores;
    this.ethRpcUrls = ethRpcUrls ?? [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com",
      "https://cloudflare-eth.com",
    ];
    this._ethBlock = undefined;
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
   * { intent, liveIntent, minerId, servedBy, answer, receipt, cost }
   * with answer = { riskScore, scored, scoreSource, findings, raw }.
   *
   * Throws PaymentRequiredError when the escrow cannot cover the ask
   * (the server reports that as a 402 body, not a tool error). A
   * settled answer with no derivable risk score does NOT abort the
   * caller: it returns riskScore null + scored false, with the raw
   * answer attached, so the desk can finish the run and show the
   * evidence as-is (Rules §5: accurate claims). With
   * strictScores: true the old AnswerShapeError throw is restored.
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
    const params =
      payload.params ?? (await this.defaultParams(live, subject, payload.metadata ?? {}));
    const args = { miner: minerId, intent: live, question };
    if (params && Object.keys(params).length > 0) args.params = params;

    let r;
    try {
      r = await this.callTool("telegraph_ask_miner", args);
    } catch (err) {
      // Observed live 14 Nov 2026 (sessions E4/E5): the #1 sanctions
      // miner cannot accept the intent's required `name` param — the
      // node answers 503 no_compatible_miner and its own hint says to
      // use telegraph_ask. The node-routed ask settled that exact
      // case (session E6), so fall back to it instead of failing.
      const body = parseToolErrorBody(err);
      if (body?.status === 503 && body?.error === "no_compatible_miner") {
        const askArgs = { intent: live, question };
        if (params && Object.keys(params).length > 0) askArgs.params = params;
        r = await this.callTool("telegraph_ask", askArgs);
      } else {
        throw err;
      }
    }
    if (r && typeof r === "object" && r.status === 402) throw new PaymentRequiredError(r);

    const raw = r?.answer ?? r;
    const derived = deriveRiskScore(intent, raw);
    if (!derived.scored && this.strictScores) throw new AnswerShapeError(intent, raw);
    const findings = pickFindings(raw);
    const cost =
      r?.cost_usd ??
      r?.payment?.price_usd ??
      r?.cost ??
      r?.price_usd ??
      this._prices.get(live)?.get(minerId) ??
      null;
    const receiptHash =
      r?.payment?.receipt?.receipt_hash ??
      r?.receipt?.receipt_hash ??
      r?.receipt?.id ??
      r?.receipt_id ??
      r?.id ??
      null;
    return {
      intent,
      liveIntent: live,
      minerId,
      servedBy: typeof r?.miner === "string" ? r.miner : null,
      answer: {
        riskScore: derived.riskScore,
        scored: derived.scored,
        scoreSource: derived.source,
        findings,
        raw,
      },
      receipt: {
        id: receiptHash,
        network: this.network,
        raw: r,
      },
      cost,
    };
  }

  /**
   * Params for a live intent, built from the listing subject (see
   * defaultIntentParams). ONCHAIN_METRIC_VERIFY_GENERAL also needs a
   * current Ethereum block number, fetched once from a public RPC.
   */
  async defaultParams(liveIntent, subject = {}, metadata = {}) {
    const block =
      liveIntent === "ONCHAIN_METRIC_VERIFY_GENERAL" ? await this._latestEthBlock() : null;
    return defaultIntentParams(liveIntent, subject, metadata, block);
  }

  /** Latest Ethereum mainnet block from a public RPC, or null. */
  async _latestEthBlock() {
    if (this._ethBlock !== undefined) return this._ethBlock;
    for (const url of this.ethRpcUrls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
          signal: AbortSignal.timeout(8000),
        });
        const body = await res.json();
        const n = Number.parseInt(body?.result, 16);
        if (Number.isFinite(n) && n > 0) {
          this._ethBlock = n;
          return n;
        }
      } catch {
        /* try the next RPC */
      }
    }
    this._ethBlock = null;
    return null;
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

/**
 * Params the live intents require, built from the listing subject.
 * Shapes verified via telegraph_intent on 14 Nov 2026 (session E3);
 * asks without them bounce 400 invalid_params, uncharged (E2).
 * `ethBlock` is only used by ONCHAIN_METRIC_VERIFY_GENERAL; when it
 * is null the params come back empty and that ask will fail loudly
 * (recorded by the desk) rather than guess a block.
 */
export function defaultIntentParams(liveIntent, subject = {}, metadata = {}, ethBlock = null) {
  switch (liveIntent) {
    case "ONCHAIN_METRIC_VERIFY_GENERAL": {
      // The intent reads an address's native balance / tx count at a
      // stated block, and only on ethereum | polygon | arbitrum.
      // Desk subjects live elsewhere (the sample is BSC), so — exactly
      // as manual session E4 did — it reads the DEPLOYER on Ethereum.
      if (ethBlock === null || !(subject.deployer ?? subject.contractAddress)) return {};
      return {
        address: subject.deployer ?? subject.contractAddress,
        block: ethBlock,
        chain: "ethereum",
        metric: "balance",
      };
    }
    case "WASH_TRADING_DETECTION_GENERAL":
      return subject.contractAddress ? { subject: subject.contractAddress } : {};
    case "SOCIAL_BOT_DETECTION_GENERAL": {
      const account =
        metadata.socialAccount ??
        (subject.tokenName ? subject.tokenName.replace(/\s+/g, "") : null) ??
        subject.tokenSymbol ??
        null;
      return account ? { account } : {};
    }
    case "SANCTIONS_SCREENING_MATCH_GENERAL": {
      const name = subject.tokenName ?? subject.deployer ?? subject.contractAddress;
      return name ? { name } : {};
    }
    default:
      // SMART_CONTRACT_AUDIT_GENERAL takes no params (params: []).
      return {};
  }
}

/**
 * Derive a 0–100 risk score from a settled miner answer — ONLY from
 * numbers and facts the miner itself returned, following the
 * answer_fields telegraph_intent documents for each intent
 * (14 Nov 2026). Returns { riskScore, scored, source }; when nothing
 * is derivable, scored is false and the desk records the intent as
 * unscored instead of running on an invented number (Rules §5).
 */
export function deriveRiskScore(intent, raw) {
  const unscored = (why) => ({ riskScore: null, scored: false, source: why });
  if (!raw || typeof raw !== "object") return unscored("answer is not an object");
  // The GHSA audit miner returns a bare LIST of advisory records
  // (session F2) — other software's CVEs, not a verdict on the
  // subject. No honest single score exists; report it unscored.
  if (Array.isArray(raw)) return unscored("answer is a list of records, not a scored verdict");

  // 1. An explicit 0–100 risk field, any common spelling.
  for (const key of ["riskScore", "risk_score", "risk"]) {
    const v = raw[key];
    if (typeof v === "number" && v >= 0 && v <= 100)
      return { riskScore: v, scored: true, source: key };
  }
  // 2. Sanctions: `matched` is a fact, not an estimate. A match is a
  //    hard veto at the desk, so it maps to 100; no match maps to the
  //    miner's own fuzzy score, or 0 — the screening came back clear.
  if (typeof raw.matched === "boolean") {
    if (raw.matched) return { riskScore: 100, scored: true, source: "matched=true" };
    if (typeof raw.match_score === "number" && raw.match_score >= 0 && raw.match_score <= 1)
      return {
        riskScore: Math.round(raw.match_score * 100),
        scored: true,
        source: "match_score (matched=false)",
      };
    return { riskScore: 0, scored: true, source: "matched=false" };
  }
  // 3. Documented 0–1 fraction fields (SOCIAL bot_score, SANCTIONS
  //    match_score when `matched` itself is absent).
  for (const key of ["bot_score", "match_score"]) {
    const v = raw[key];
    if (typeof v === "number" && v >= 0 && v <= 1)
      return { riskScore: Math.round(v * 100), scored: true, source: key };
  }
  // 4. Wash trading: the answer's own wash-volume percentage.
  if (
    typeof raw.wash_volume_pct === "number" &&
    raw.wash_volume_pct >= 0 &&
    raw.wash_volume_pct <= 100
  )
    return { riskScore: raw.wash_volume_pct, scored: true, source: "wash_volume_pct" };
  // 5. Audit-style severity evidence: findings/advisories carrying
  //    severities, or top-level severity counts.
  const sev = severityScore(raw);
  if (sev !== null) return { riskScore: sev, scored: true, source: "severity-weighted findings" };
  // 6. Last resort, WASH only: the score the miner states in its own
  //    summary prose — observed live in session E2: "ELEVATED
  //    wash-trading risk (score 0.53)". Only that exact phrasing.
  if (intent === "WASH_TRADING_DETECTION" || intent === "WASH_TRADING_DETECTION_GENERAL") {
    const m =
      typeof raw.summary === "string"
        ? raw.summary.match(/\(score\s+(0(?:\.\d+)?|1(?:\.0+)?)\)/i)
        : null;
    if (m)
      return {
        riskScore: Math.round(Number(m[1]) * 100),
        scored: true,
        source: "miner-stated score in summary",
      };
  }
  return unscored("no derivable risk field in answer");
}

const SEVERITY_WEIGHTS = { critical: 45, high: 25, medium: 10, moderate: 10, low: 3 };

/** Severity-weighted score from an answer's own severity evidence, or null. */
function severityScore(raw) {
  let total = 0;
  let found = false;
  const addWord = (w) => {
    const k = String(w).toLowerCase();
    if (k in SEVERITY_WEIGHTS) {
      total += SEVERITY_WEIGHTS[k];
      found = true;
    }
  };
  for (const k of Object.keys(SEVERITY_WEIGHTS)) {
    if (typeof raw[k] === "number" && raw[k] > 0) {
      total += SEVERITY_WEIGHTS[k] * raw[k];
      found = true;
    }
  }
  for (const key of ["findings", "advisories", "vulnerabilities", "issues"]) {
    const arr = raw[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && typeof item === "object" && item.severity) addWord(item.severity);
      else if (typeof item === "string") {
        const m = item.match(/^\s*(critical|high|medium|moderate|low)\b/i);
        if (m) addWord(m[1]);
      }
    }
  }
  return found ? Math.min(100, total) : null;
}

function pickFindings(raw) {
  if (Array.isArray(raw)) {
    // The GHSA audit miner returns a bare list of GitHub advisories.
    if (raw.length === 0) return ["Miner returned an empty list."];
    const first = raw[0] ?? {};
    const id = first.cve_id ?? first.ghsa_id ?? first.id ?? "advisory";
    const cvss = first.cvss?.score ?? first.cvss_severities?.cvss_v3?.score;
    return [
      `Miner returned ${raw.length} advisory record(s) (first: ${id}` +
        `${typeof cvss === "number" ? `, CVSS ${cvss}` : ""}) — an advisory feed, not a contract-specific audit.`,
    ];
  }
  if (Array.isArray(raw?.findings))
    return raw.findings.map((f) => (typeof f === "string" ? f : JSON.stringify(f)));
  if (typeof raw?.findings === "string") return [raw.findings];
  if (typeof raw?.matched === "boolean") {
    return raw.matched
      ? [
          `SANCTIONS MATCH: ${(raw.matches ?? []).join(", ") || "matched a sanctions list"} ` +
            `(lists: ${(raw.lists ?? []).join(", ") || "n/a"}).`,
        ]
      : [`No sanctions-list match (lists checked: ${(raw.lists ?? []).join(", ") || "n/a"}).`];
  }
  if (typeof raw?.summary === "string") return [raw.summary];
  if (typeof raw?.answer === "string") return [raw.answer];
  if (typeof raw?.reason === "string") return [raw.reason];
  if (typeof raw?.verdict === "string") return [raw.verdict];
  if (raw && typeof raw === "object" && Object.keys(raw).length > 0)
    return [`Miner answer carried no findings text (fields: ${Object.keys(raw).join(", ")}).`];
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
