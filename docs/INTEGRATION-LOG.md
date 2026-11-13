# Integration log — First Integration Milestone (14 Nov 2026)

Track 03 (Apps & Agents) · Mission 01: Exchange · "Autonomous Listings Desk"
Registered entrant: bejo · kemzie797b@gmail.com · Discord Timferris#0 ·
GitHub `Abdul99090` (registration confirmed; `telegraphprotocol/bounties`
starred before this session).

All times WIB (UTC+7). Raw evidence: `out/mcp-session-a.json`,
`out/mcp-session-b.json`, `out/mcp-session-c.json` (full MCP transcripts),
`docs/tools-list-full.json` (raw tools/list), `docs/MCP-TOOLS.md`
(schemas + notes). Reproduce with `scripts/mcp-session.mjs` and the plan
files in `scripts/`.

## TL;DR

The desk is **connected and verified against the live network**: official
setup done, MCP handshake + tools/list captured, client rewritten to the
real schemas, discovery tools exercised live, and **three genuine paid
purchase attempts** were made. All three stopped at the same documented
gate — the escrow is empty — with the node's exact refusal:

> `402 payment required — insufficient escrow for delivery: committed=0 μUSDC + price=10000 μUSDC > available=0 μUSDC` (nothing was charged)

The only remaining step to a settled purchase is funding, and funding
requires an **interactive Anjoman sign-in** (see Blocker 1) — a browser
step outside this session's reach.

## 1. Endpoint discovery (official sources only)

- The MCP server is **not hosted**. Per the official Glama listing and the
  package docs, it is a local stdio server:
  `npx -y @telegraphprotocol/telegraph-protocol-mcp` (Node ≥ 20; we run
  Node v24.22.1).
- It talks to the node `https://devnode.telegraphprotocol.com` (beta 2,
  Ethereum Sepolia `eip155:11155111`, 136 intents at setup time).
- The scaffold's `TELEGRAPH_MCP_URL` / `TELEGRAPH_API_KEY` model was
  wrong; there is no URL or key. Identity is a dedicated wallet created
  by the official `setup` command.

## 2. Setup — 01:09–01:11 WIB

`npx -y @telegraphprotocol/telegraph-protocol-mcp setup`:

- Node check: `https://devnode.telegraphprotocol.com (reachable, 136 intents)`
- Created a new dedicated wallet → **address
  `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46`**, saved to
  `~/.telegraph/wallet.json` (mode 0600; the key never leaves that file
  and is not in this repo).
- Balances at creation: `holds 0 USDC and 0 ETH for gas · escrow 0 USDC spendable`.
- Deposit prompt answered 0 → `Not an amount; nothing was moved.`
  (nothing to move: the wallet is empty by construction).
- `status` cross-check: escrow contract
  `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b`, test USDC
  `0xcc194e1a843B658526D0D5C431f670028582Ae17`, payment rail `escrow`,
  limits max $0.50/ask, $5/day, spent today $0.

## 3. MCP sessions — handshake + tools/list + live calls

Probe client: `scripts/mcp-session.mjs` (spawn server → `initialize` →
`notifications/initialized` → plan steps). Server identity returned:
`{"name": "telegraph", "version": "2.0.0"}` in all three sessions.

### Session A — 01:12:45–01:13:53 WIB (default env, 8 tools)

- `tools/list` OK (76 ms) — 8 tools: telegraph_ask, telegraph_ask_miner,
  telegraph_find_intents, telegraph_intent, telegraph_find_miners,
  telegraph_ranking, telegraph_account, telegraph_docs.
- `telegraph_docs {topic: "getting started"}` → MCP error -32602:
  `Invalid enum value. Expected 'getting-started' | 'payments' |
  'intents-and-ranking' | 'troubleshooting', received 'getting started'`
  — live topics are kebab-case (scaffold assumption corrected).
- `telegraph_docs {topic: "payments"}` OK — full payments guide returned.
- `telegraph_account {}` OK (5.6 s) — the status JSON above, live from chain.
- `telegraph_find_intents {search: "AUDIT"}` OK — 5 intents, incl.
  `SMART_CONTRACT_AUDIT_GENERAL` (18 miners).
- `telegraph_intent {intent: "SMART_CONTRACT_AUDIT"}` → kind judgment,
  **`miners: 0`**, "Not ranked yet" — the bare catalogue name is unserved.
- `telegraph_ranking {intent: "SMART_CONTRACT_AUDIT"}` → epoch 2083,
  "Not ranked yet".
- `telegraph_find_miners {intent: "SMART_CONTRACT_AUDIT"}` → count 0.
- **Purchase attempt #1**: `telegraph_ask {intent: "CRYPTO_PRICE_USD",
  question: "What is the current price of BTC in USD?"}` → after 42.3 s,
  tool error `fetch failed` (transient node fetch failure; superseded by
  attempt #2's clean protocol answer).

### Session B — 01:14:13–01:14:36 WIB (catalogue + attempt #2)

- `telegraph_docs` topics `getting-started`, `intents-and-ranking`,
  `troubleshooting` all OK. Getting-started confirms the funding path
  verbatim: *"Get it from the faucet at
  https://anjoman.ai/dashboard/faucet: sign in, send it to your
  Telegraph wallet, 1 USDC per account every 24 hours. The `fund`
  command points you there. Transactions need a little Sepolia ETH for
  gas, which public Sepolia faucets give out."*
- `telegraph_find_intents {limit: 200}` → **136 intents**. All eight
  Mission 01 intents exist as `*_GENERAL` variants with live miners
  (table in docs/MCP-TOOLS.md).
- `telegraph_intent {intent: "SMART_CONTRACT_AUDIT_GENERAL"}` → kind
  judgment, 18 miners, params [], top-ranked `sca-ghsa` (score 1).
- `telegraph_find_miners {intent: "SMART_CONTRACT_AUDIT_GENERAL",
  limit: 5}` → #1 = id `151007`, slug `sca-ghsa`, "GHSA Audit
  Advisories", status active, **price_usd 0.01**, rank 1.
- `telegraph_ranking {intent: "SMART_CONTRACT_AUDIT_GENERAL"}` → epoch
  2083 ranking present (no prices — prices live on find_miners).
- **Purchase attempt #2**: `telegraph_ask {intent: "CRYPTO_PRICE_USD",
  question: …}` → clean refusal (3.2 s), full body:

  ```json
  { "status": 402, "error": "payment required",
    "reason": "insufficient escrow for delivery: committed=0 μUSDC + price=10000 μUSDC > available=0 μUSDC",
    "hint": "Payment from escrow refused (…), and nothing was charged. telegraph_account shows the balance and anything owed; the user fixes it by running `npx -y @telegraphprotocol/telegraph-protocol-mcp fund` in a terminal and confirming the amount.",
    "payment": { "rail": "escrow", "price_usd": 0.01, "escrow": "insufficient escrow for delivery: …" } }
  ```

### Session C — 01:14:47–01:15:04 WIB (TELEGRAPH_ALLOW_AGENT_DEPOSIT=1, 9 tools)

- `tools/list` OK — **9 tools** (adds `telegraph_deposit`,
  `amount_usd` required, > 0, ≤ 10000).
- **Purchase attempt #3 (the desk's own pattern)**:
  `telegraph_ask_miner {miner: "sca-ghsa", intent:
  "SMART_CONTRACT_AUDIT_GENERAL", question: "Audit the ERC-20 token
  contract at 0x0000…0000 …"}` → same 402 body as attempt #2
  (price 10000 μUSDC, available 0; flagged `isError` on this tool —
  the client now normalises both forms).
- **Funding attempt**: `telegraph_deposit {amount_usd: 1}` → tool error,
  verbatim: **`The wallet holds 0 USDC, less than 1.`**

### Client verification — after the rewrite (01:2x WIB)

- `McpTelegraphClient.account()` → live status for
  `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46`, escrow spendable 0.
- `getRanking("SMART_CONTRACT_AUDIT")` → maps to
  `SMART_CONTRACT_AUDIT_GENERAL`, returns sca-ghsa #1 @ $0.01, etc.
- `askMiner(...)` → throws `PaymentRequiredError` with the node's exact
  reason (bug found & fixed during verification: ask_miner's 402 is
  flagged `isError`, ask's is not — both now handled).
- `deposit(1)` → `TelegraphToolError: The wallet holds 0 USDC, less than 1.`
- `node src/index.js --live` → plans all 5 desk intents from live
  rankings (planned ≈ $0.05), attempts the first purchase, stops on
  `PaymentRequiredError` — the full desk pipeline works up to the
  funding gate.
- `npm test` → 4/4 pass (simulation path untouched).

### `fund` CLI — funding attempt from the terminal

`npx -y @telegraphprotocol/telegraph-protocol-mcp fund` prints the
wallet state (0 USDC / 0 ETH / escrow 0) and waits for an interactive
amount confirmation — there is nothing to confirm until the wallet
holds test USDC, and depositing also needs Sepolia ETH for gas
(wallet ETH = 0).

## 4. Code changes made

- `src/telegraph/client.js` — `McpTelegraphClient` rewritten: stdio
  spawn + initialize handshake (was: HTTP POST + Bearer key to a
  non-existent hosted endpoint); real argument shapes
  (`telegraph_ask_miner {miner, intent, question, params}`,
  `telegraph_deposit {amount_usd}`); pricing via `telegraph_find_miners`
  (ranking has no prices); `LIVE_INTENT_MAP` mission→`*_GENERAL`
  translation; 402 → `PaymentRequiredError`; tool errors →
  `TelegraphToolError`; miner answers are normalised but a missing risk
  score raises `AnswerShapeError` instead of an invented number.
  Wallet-missing still refuses live mode (`NotRegisteredError`, new
  message pointing at the official `setup`).
- `src/index.js` — `--live` constructs the client with no URL/key;
  banner names the real network (beta 2 / Ethereum Sepolia).
- `.env.example` — rewritten: no key/URL; documents the wallet model.
- `scripts/mcp-session.mjs` + `scripts/plan-{a,b,c}-*.json` — the probe
  tooling used for this log (re-runnable).
- `docs/MCP-TOOLS.md`, `docs/tools-list-full.json` — the schema dump.

## 5. Blockers remaining

1. **Test-USDC faucet requires an interactive Anjoman sign-in.**
   https://anjoman.ai/dashboard/faucet renders only *"Sign in to see
   the faucet."* (fetched 14 Nov 2026, 01:15 WIB); the server's own
   getting-started docs say the same ("sign in, send it to your
   Telegraph wallet, 1 USDC per account every 24 hours"). Claiming is a
   live-browser, signed-in step — outside this session. Whoever does it
   must send the 1 test USDC to the Telegraph wallet
   `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46` (Ethereum Sepolia,
   token `0xcc194e1a843B658526D0D5C431f670028582Ae17`).
2. **Sepolia ETH for gas = 0.** `telegraph_deposit` runs approve +
   depositUSDC on chain; the wallet holds 0 ETH. A public Sepolia
   faucet drip to the same address is needed before `fund`/`deposit`
   can settle (most public faucets are likewise interactive).
3. **Successful-ask response shape still unobserved.** Answer/receipt
   field shapes can only be captured once escrow ≥ $0.01; the client's
   normaliser is defensive and fails loudly (`AnswerShapeError`) rather
   than guessing. First funded run: one `telegraph_ask`
   (CRYPTO_PRICE_USD, $0.01), capture the body, pin the adapter.

Once 1–2 land: `fund` (or `telegraph_deposit {amount_usd: 1}`) → escrow
1 USDC → `node src/index.js --live` should settle 5 purchases ≈ $0.05
and produce the first real-receipt memo.
