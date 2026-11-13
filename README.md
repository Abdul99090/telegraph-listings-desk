# Telegraph Listings Desk

**Telegraph Hackathon Season II — Track 03 (Apps & Agents) · Mission 01: Exchange**

An autonomous listings desk: when a token listing application arrives, an agent buys the intelligence it needs through Telegraph — contract audit, on-chain metric verification, wash-trading detection, social bot detection, sanctions screening — and returns **a signed listing risk memo with a cost line**. This is Mission 01's own worked example, built on our existing market-radar pattern: *signal → evaluation → intent purchase → decision*.

- Event: 1 Nov – **1 Dec 2026, 23:59 UTC** (2 Dec 06:59 WIB), fully online, testnet.
- Prize pool: $10,000 total — $7,000 main competition (Apps & Agents track: **$3,000**) + $3,000 reserved for separate December challenges.
- Official site: https://hackathon.telegraphprotocol.com/ · Rules: /rules · Build: /build

> Status (14 Nov 2026): **registered + first integration milestone done.** The desk connects to the live beta-2 network through the official MCP server, plans from real rankings, and has made its first real purchase attempts — stopped only by the empty escrow (funding needs an interactive Anjoman faucet sign-in). Full evidence: `docs/INTEGRATION-LOG.md`; live tool schemas: `docs/MCP-TOOLS.md`. Offline simulation still available for development.

## Why this mission

Mission 01 (Exchange) is the closest of the 15 missions to what we already do: our Jalur-Kita radar watches new BSC projects and evaluates them before acting. The desk formalises that into a buyer of graded intelligence:

| Our radar step | Desk equivalent |
|---|---|
| Watcher surfaces a new token / listing signal | `src/radar/signals.js` normalises it into a listing application |
| Manual vetting (audit, holders, wash trading, socials) | Five Telegraph **Intents** bought from ranked Miners |
| Go / no-go decision | Weighted risk aggregation + hard vetoes in `src/agent/listingsDesk.js` |
| Report with tx evidence | Memo with **receipts + cost line** (`src/memo.js`) |

Core intents for Mission 01 (official catalogue, `catalog/missions.json` in the bounties repo): `SMART_CONTRACT_AUDIT`, `SECURITY_REVIEW`, `ONCHAIN_METRIC_VERIFY`, `TOKEN_TOTAL_SUPPLY_VERIFY`, `SANCTIONS_SCREENING_MATCH`, `SOCIAL_BOT_DETECTION`, `WASH_TRADING_DETECTION`, `LIQUIDITY_DEPTH_VERIFY`. The desk buys five of them per decision (audit, on-chain verify, wash trading, social bots, sanctions); the other three are stretch goals.

## Architecture

```
telegraph/
├── README.md                  ← this file (plan + submission checklist)
├── docs/RESEARCH.md           ← protocol research notes (sources cited)
├── docs/MCP-TOOLS.md          ← live tools/list schemas (14 Nov 2026)
├── docs/INTEGRATION-LOG.md    ← first-integration milestone evidence
├── scripts/                   ← mcp-session.mjs probe + session plans
├── examples/sample-listing.json
├── src/
│   ├── index.js               ← CLI: --simulate (offline) | --live (testnet)
│   ├── radar/signals.js       ← signal → listing application
│   ├── agent/listingsDesk.js  ← plan → price → BUY → decide → memo
│   ├── memo.js                ← risk memo (markdown + JSON, SHA-256 hash)
│   └── telegraph/
│       ├── intents.js         ← Mission 01 intent selection + weights
│       └── client.js          ← McpTelegraphClient (live, official MCP)
│                                + SimulatedTelegraphClient (fixtures)
└── test/listingsDesk.test.js  ← 4 tests (node --test)
```

One run follows the H2 "anatomy of a build" exactly: **Goal** (list or not?) → **Intelligence** (5 intents) → **Route** (each request goes to the Intent's #1-ranked Miner) → **Receipt** (every answer returns with a receipt + settled cost) → **Outcome** (verdict + memo). Before buying anything, the desk prices the whole run from the rankings and refuses to start if it exceeds `TELEGRAPH_MAX_SPEND_PER_RUN` (Rules §5 "safe handling": spending limits).

Decision logic: weighted risk (audit 35%, on-chain 25%, wash 20%, social 10%, sanctions 10%); `LIST` < 25, `REVIEW` 25–45, `REJECT` ≥ 45 — plus hard vetoes: sanctions score ≥ 90 or audit score ≥ 85 reject immediately.

## Run it (simulation)

```sh
npm test          # 4 tests: clean→LIST, rug→REJECT, sanctioned→REJECT, ceiling→no purchases
npm run demo      # evaluates examples/sample-listing.json, writes out/memo-*.{json,md}
```

Simulation mode uses fixture Miners that score the sample's declared metadata with transparent rules (`scoreIntent` in `client.js`). Their receipts are watermarked `SIMULATED` and are **not** network evidence — the live path (`--live`) has no silent fallback, by design (Rules §5: accurate claims).

## How buying works (live path)

The official machine interface is the **Telegraph MCP server** (`@telegraphprotocol/telegraph-protocol-mcp`, v2.0.0) — a **local stdio server**, not a hosted endpoint: it holds a dedicated wallet (`~/.telegraph/wallet.json`, created by its `setup` command; ours: `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46` on Ethereum Sepolia, beta 2) and pays asks from escrow (~$0.01 each). Tools: `telegraph_docs`, `telegraph_ask`, `telegraph_account`, `telegraph_deposit`, `telegraph_find_intents`, `telegraph_intent`, `telegraph_find_miners`, `telegraph_ranking`, `telegraph_ask_miner` — full live schemas in `docs/MCP-TOOLS.md`. `McpTelegraphClient` maps the desk's two operations onto them: `telegraph_find_miners` (price/plan — `telegraph_ranking` carries no prices) and `telegraph_ask_miner` (the paid request). Two live-network facts the desk encodes: the Mission 01 catalogue names have zero miners live — the served intents are the `*_GENERAL` variants (`LIVE_INTENT_MAP`) — and an unfunded ask returns a **402 body**, not an error, which the client surfaces as `PaymentRequiredError`. Funding is test USDC from the Anjoman faucet (sign-in required) plus a little Sepolia ETH, then `fund`/`telegraph_deposit` into escrow. Evaluation work for the network is submitted through **Anjoman** (anjoman.ai); apps consume intelligence as customers.

## Submission requirements (Rules §5 + §8, verbatim-condensed)

Register **once** on the H2 website (choose track + mission) — one registration covers all three tracks. Final entry goes through the H2 website by **1 Dec 2026, 23:59 UTC** and must include:

1. **Project details** — team/contact, track, project name, chosen missions/Intents, a working or reviewer-access link, and **the GitHub username that starred `github.com/telegraphprotocol/bounties`** (starring is a required entry element for every track).
2. **Short demo** — 2–5 minute video or accessible equivalent showing real input, result, and the Telegraph integration (screen recording is fine).
3. **How to run it** — beginner-friendly steps, prerequisites, configuration, a sample request, expected result, the actual network used, spending limits/costs, known limitations. Judges must be able to reproduce it.
4. **Evidence** — real receipts, requests, accounting records, endpoints, tests. For Apps & Agents: identify each working app, its missions/Intents, the purchased intelligence, and the outcome.
5. **Short public summary** — what was built, which mission it serves, what works, how others can try it; include links to public progress updates (20 of 100 judging points are growth/education/activation: aim for ≥3 public updates on separate dates).
6. **Showcase permission** — what may be shared publicly; buyer-introduction opt-in.

Entry bar (Rules §5–§6): the app must make **at least one genuinely autonomous machine-to-machine purchase** through the supported Telegraph flow and use the intelligence for a meaningful task (a supported **testnet** implementation qualifies). Scoring is out of 100; winning needs **≥ 70/100** and the technical minimum **24/35** on technical quality. Mission acceptance test: a reviewer must be able to run it with new input, check the result, inspect the real Telegraph request + transaction/accounting evidence, break it with a reasonable failure case, and reproduce it from our instructions.

Timeline: Season opened 1 Nov · **First Integration Milestone 14 Nov** (Apps & Agents: show a first working Telegraph request/purchase, an attempt, or what's blocking — a progress check, not a deadline) · Community showcase 20 Nov · **Close 1 Dec 23:59 UTC** · Judging 2–8 Dec · Provisional results from 9 Dec (72h appeal window).

Prize eligibility note (Rules §4/§10): cash prizes are governed by official prize-payment terms — eligible countries, **identity and tax checks**, supported payout methods. Registration alone does not confirm cash eligibility.

## Blockers (honest list, updated 14 Nov 2026)

1. ~~Registration not done~~ — **done**: registered (bejo / kemzie797b@gmail.com / Discord Timferris#0), `telegraphprotocol/bounties` starred from `Abdul99090`.
2. ~~MCP tool argument schemas unverified~~ — **verified live 14 Nov**: handshake + tools/list captured (`docs/MCP-TOOLS.md`), client rewritten to the real stdio transport and schemas, desk runs live up to the payment gate.
3. **Escrow empty — funding needs two interactive steps.** Test USDC comes only from https://anjoman.ai/dashboard/faucet, which requires signing in to Anjoman (1 USDC / account / 24h) and sending it to the desk wallet `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46`; depositing also needs a little Sepolia ETH for gas (wallet ETH = 0). Until then every ask is refused `402 payment required … available=0 μUSDC` — three real attempts logged in `docs/INTEGRATION-LOG.md`, nothing charged.
4. **Successful-ask response shape unobserved.** Only capturable once escrow ≥ $0.01; the client fails loudly (`AnswerShapeError`) instead of inventing a risk score. First funded run pins the adapter.
5. **Memo signing not implemented.** `memo.signature` is `null`; the memo hash exists. Sign the hash with the desk operator key before the demo so the "signed memo" claim is literal.
6. **Growth points need public updates.** 20/100 points require ≥3 public progress posts on separate dates (X/GitHub/Discord etc.). Content plan exists (intro post → integration post → working-result post); posting itself is a separate, human-approved step.

## Next steps

1. ~~Register on the H2 website; star `telegraphprotocol/bounties`~~ — done.
2. ~~Connect the MCP server, dump `tools/list`, fix the client~~ — done 14 Nov (`docs/INTEGRATION-LOG.md`).
3. Fund the wallet (Anjoman faucet sign-in → 1 test USDC to `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46` + a Sepolia ETH drip), `fund` into escrow, make the **first settled purchase** and pin the answer-shape adapter from the real response.
4. Wire a real signal source (chain watcher for new BSC deployments) into `signals.js`; run the desk on 2–3 real listing candidates; sign memos.
5. Record the 2–5 min demo; write the commercial summary (buyer, problem frequency, demo flow, cost); submit via the H2 website before 1 Dec 23:59 UTC.
