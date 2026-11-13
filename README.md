# Telegraph Listings Desk

**Telegraph Hackathon Season II — Track 03 (Apps & Agents) · Mission 01: Exchange**

An autonomous listings desk: when a token listing application arrives, an agent buys the intelligence it needs through Telegraph — contract audit, on-chain metric verification, wash-trading detection, social bot detection, sanctions screening — and returns **a signed listing risk memo with a cost line**. This is Mission 01's own worked example, built on our existing market-radar pattern: *signal → evaluation → intent purchase → decision*.

- Event: 1 Nov – **1 Dec 2026, 23:59 UTC** (2 Dec 06:59 WIB), fully online, testnet.
- Prize pool: $10,000 total — $7,000 main competition (Apps & Agents track: **$3,000**) + $3,000 reserved for separate December challenges.
- Official site: https://hackathon.telegraphprotocol.com/ · Rules: /rules · Build: /build

> Status (14 Nov 2026): **registered, funded, buying — final-entry prep done.** The desk connects to the live beta-2 network through the official MCP server, the escrow holds a 1 USDC testnet deposit, and the desk has completed full unattended live runs: **18 settled purchases with real receipt hashes**. The client adapter now supplies the params each intent requires, falls back to node-routed asks when a miner cannot take them, and derives risk scores only from what miners return (unscored answers are recorded, not fatal). Demo video: `video/demo.mp4` (2:30, a real recorded session). Reproduction: `docs/RUNBOOK.md`. Final-entry payload, ready to copy: `ENTRY-PAYLOAD.md`. Full evidence: `docs/INTEGRATION-LOG.md`; live tool schemas: `docs/MCP-TOOLS.md`. Offline simulation still available for development.

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
├── ENTRY-PAYLOAD.md           ← final-entry form content, copy-ready
├── docs/RUNBOOK.md            ← reproduce-from-zero guide (judges)
├── docs/RESEARCH.md           ← protocol research notes (sources cited)
├── docs/MCP-TOOLS.md          ← live tools/list schemas (14 Nov 2026)
├── docs/INTEGRATION-LOG.md    ← milestone + funding + adapter evidence
├── video/demo.mp4             ← 2:30 demo — a real recorded live session
├── scripts/                   ← mcp-session.mjs probe + session plans
│                                + demo-live.mjs / demo-session.sh /
│                                render-demo-video.py (the demo pipeline)
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
└── test/                      ← 11 tests (node --test): desk + adapter
```

One run follows the H2 "anatomy of a build" exactly: **Goal** (list or not?) → **Intelligence** (5 intents) → **Route** (each request goes to the Intent's #1-ranked Miner) → **Receipt** (every answer returns with a receipt + settled cost) → **Outcome** (verdict + memo). Before buying anything, the desk prices the whole run from the rankings and refuses to start if it exceeds `TELEGRAPH_MAX_SPEND_PER_RUN` (Rules §5 "safe handling": spending limits).

Decision logic: weighted risk (audit 35%, on-chain 25%, wash 20%, social 10%, sanctions 10%); `LIST` < 25, `REVIEW` 25–45, `REJECT` ≥ 45 — plus hard vetoes: sanctions score ≥ 90 or audit score ≥ 85 reject immediately.

## Run it (simulation)

```sh
npm test          # 11 tests: clean→LIST, rug→REJECT, sanctioned→REJECT, ceiling→no purchases, adapter (params/scores/fallback)
npm run demo      # evaluates examples/sample-listing.json, writes out/memo-*.{json,md}
```

Simulation mode uses fixture Miners that score the sample's declared metadata with transparent rules (`scoreIntent` in `client.js`). Their receipts are watermarked `SIMULATED` and are **not** network evidence — the live path (`--live`) has no silent fallback, by design (Rules §5: accurate claims).

## How buying works (live path)

The official machine interface is the **Telegraph MCP server** (`@telegraphprotocol/telegraph-protocol-mcp`, v2.0.0) — a **local stdio server**, not a hosted endpoint: it holds a dedicated wallet (`~/.telegraph/wallet.json`, created by its `setup` command; ours: `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46` on Ethereum Sepolia, beta 2) and pays asks from escrow (~$0.01 each). Tools: `telegraph_docs`, `telegraph_ask`, `telegraph_account`, `telegraph_deposit`, `telegraph_find_intents`, `telegraph_intent`, `telegraph_find_miners`, `telegraph_ranking`, `telegraph_ask_miner` — full live schemas in `docs/MCP-TOOLS.md`. `McpTelegraphClient` maps the desk's two operations onto them: `telegraph_find_miners` (price/plan — `telegraph_ranking` carries no prices) and `telegraph_ask_miner` (the paid request). Live-network facts the desk encodes: the Mission 01 catalogue names have zero miners live — the served intents are the `*_GENERAL` variants (`LIVE_INTENT_MAP`); an unfunded ask returns a **402 body**, not an error, surfaced as `PaymentRequiredError`; three intents **require params** (ONCHAIN needs an address + block, SOCIAL an account, SANCTIONS a name) which the client builds from the listing subject; a miner that cannot take its intent's params (503) is bypassed via node-routed `telegraph_ask`; and settled answers are intent-shaped, so risk scores are **derived only from fields the miner returned** (`deriveRiskScore`) — anything else is recorded unscored and the run completes. Funding landed 14 Nov: Sepolia ETH from a public faucet + exactly 1 test USDC minted directly (the Anjoman faucet path was a dead end — its verification email never arrived), deposited into escrow; a deposit becomes spendable at the next epoch boundary. Evaluation work for the network is submitted through **Anjoman** (anjoman.ai); apps consume intelligence as customers.

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
2. ~~MCP tool argument schemas unverified~~ — **verified live 14 Nov**: handshake + tools/list captured (`docs/MCP-TOOLS.md`), client rewritten to the real stdio transport and schemas.
3. ~~Escrow empty~~ — **funded 14 Nov**: 0.05 Sepolia ETH (public faucet) + exactly 1 test USDC (direct mint; the Anjoman verification email never arrived), deposited into escrow (approve + depositUSDC txs in `docs/INTEGRATION-LOG.md`). 18 settled purchases followed; ≈ $0.82 of the deposit remains.
4. ~~Successful-ask response shape unobserved~~ — **observed and adapted**: real shapes captured (sessions E/F), the adapter derives scores per intent and records unscored answers instead of aborting (`docs/RUNBOOK.md` §7).
5. **Memo signing not implemented.** `memo.signature` is `null`; the memo hash exists. Sign the hash with the desk operator key before the demo so the "signed memo" claim is literal.
6. **Growth points need public updates.** 20/100 points require ≥3 public progress posts on separate dates (X/GitHub/Discord etc.). Content plan exists (intro post → integration post → working-result post); posting itself is a separate, human-approved step.
7. **Entry not yet submittable from this repo alone.** The final entry goes through the H2 website (see `ENTRY-PAYLOAD.md`), but the payload needs: this repo pushed public (no remote yet), the demo video at a public URL, and the public-update links from item 6.

## Next steps

1. ~~Register on the H2 website; star `telegraphprotocol/bounties`~~ — done.
2. ~~Connect the MCP server, dump `tools/list`, fix the client~~ — done 14 Nov (`docs/INTEGRATION-LOG.md`).
3. ~~Fund the wallet, deposit, first settled purchases~~ — done 14 Nov (18 settled asks, receipts in `ENTRY-PAYLOAD.md` §4).
4. ~~Fix the client adapter (params, 503 fallback, unscored answers)~~ — done 14 Nov; `node src/index.js --live` now completes full runs unattended.
5. ~~Record the 2–5 min demo~~ — done: `video/demo.mp4` (2:30, real session).
6. Push the repo public; host the video; publish the ≥3 public updates; submit via the H2 website before 1 Dec 23:59 UTC — checklist in `ENTRY-PAYLOAD.md`.
7. Stretch: wire a real signal source (chain watcher for new BSC deployments) into `signals.js`; run the desk on 2–3 real listing candidates; sign memos.
