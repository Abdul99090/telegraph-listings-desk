# Telegraph Protocol — research notes

Compiled 13 Nov 2026 from official sources only: hackathon.telegraphprotocol.com
(home, /rules, /build, /how-it-works, mission pages), the official bounties repo
(github.com/telegraphprotocol/bounties — README, docs/H2.md, docs/INTEGRATION.md,
docs/NETWORK_MAP.md, AGENTS.md, catalog/missions.json), and the official MCP
server listing (glama.ai/mcp/servers/telegraphprotocol/telegraph-mcp).

## The model

Telegraph is "the network that turns intelligence into a graded commodity" —
a peer-to-peer ranking protocol for machine intelligence.

- **Intent** — one kind of rankable intelligence, e.g. `SMART_CONTRACT_AUDIT`,
  `WEATHER_FORECAST_VERIFY`. Shared network-wide; not a product by itself.
- **Providers / Miners** — supply answers for Intents; they compete per Intent
  on *measured* performance (not per industry).
- **Evaluators** — compete per Intent over *how* performance is measured;
  stronger measurement can replace weaker measurement. A scoring module is
  registered on an Intent *family* and scores only Intents of that family's
  kind (deterministic / judgment / hybrid).
- **Validators** — verify execution and finalise ranking state.
- **Rankings** — per Intent; paid demand is routed by measured performance.
- **Apps & Agents (Track 03)** — buy Intents to solve one of 15 commercial
  missions; the app is the proof that ranked intelligence works.
- **Receipts** — every purchase settles with a receipt + payment record; this
  is the evidence judges inspect.

Season II "works backwards": 15 commercial missions define demand → Intents
define the intelligence needed → Providers supply → Evaluators measure → apps
prove it. Flywheel: demand reveals needed intelligence → providers compete →
evaluators improve measurement → rankings guide paid demand → opportunity
attracts supply.

Network status per the H2 home page: on **testnet** today; 1,500+ miners
supplying intelligence, 45 use cases live, 130,000+ testnet transactions,
2,000 developers registered for Season I, 1,000+ models being implemented for
machines to query by mainnet.

## Track 03 — Apps & Agents (our track)

Build a working app or agent for ≥1 of the 15 commercial missions using
intelligence bought through Telegraph. You may enter alone or as a team, work
across tracks, and submit to more than one track if each entry is a distinct
contribution. Several teams may build for the same mission. You may prepare
and reuse your own code (disclose major reused components); H2-specific
activity/transaction evidence must come from the event period.

**Mission acceptance (per mission):** a reviewer must be able to (1) run the
app with a new, realistic input, (2) check the useful result, (3) inspect the
real Telegraph request and its transaction/accounting evidence, (4) test a
reasonable failure case, (5) reproduce it from the instructions. One app can
complete several missions, but each needs its own meaningful, testable result.

**Track requirement:** the app must make at least one genuinely autonomous
machine-to-machine purchase or sale using the supported Telegraph flow, then
use the intelligence to perform a meaningful task. A supported **testnet**
implementation qualifies.

### Mission 01: Exchange — our mission

Buyers: global spot/derivatives venues (examples named: Kraken, Gate.io,
Binance). Product: an autonomous listings desk that buys contract audit,
contributor authenticity, holder concentration and sanctions exposure in
parallel and returns a signed listing risk memo with a cost line.
Core intents (catalog/missions.json): `SMART_CONTRACT_AUDIT`,
`SECURITY_REVIEW`, `ONCHAIN_METRIC_VERIFY`, `TOKEN_TOTAL_SUPPLY_VERIFY`,
`SANCTIONS_SCREENING_MATCH`, `SOCIAL_BOT_DETECTION`,
`WASH_TRADING_DETECTION`, `LIQUIDITY_DEPTH_VERIFY`.

Intent kinds/latency targets (mission pages): `ONCHAIN_METRIC_VERIFY`
deterministic <2s · `SMART_CONTRACT_AUDIT` hybrid <8s ·
`SANCTIONS_SCREENING_MATCH` hybrid <500ms · `SOCIAL_BOT_DETECTION` judgment
<2s · `CODE_REVIEW` judgment <5s · `WASH_TRADING_DETECTION` hybrid <4s.

Most-reused intents across missions (docs/NETWORK_MAP.md):
`SANCTIONS_SCREENING_MATCH` (6), `WEB_SEARCH_QUERY` (6),
`LIQUIDITY_DEPTH_VERIFY` (5), `MACRO_ECONOMIC_INDICATOR` (5),
`QUESTION_ANSWERING` (5), `WEATHER_FORECAST_VERIFY` (5).

## Interfaces

- **MCP server** — `telegraphprotocol/telegraph-mcp` (v2.0.0, first observed
  on Glama 4 Nov 2026). Tools: `telegraph_docs` (read-only; topics: "getting
  started", "payments", "intents and ranking", "errors"; free),
  `telegraph_ask`, `telegraph_ask_miner`, `telegraph_account`,
  `telegraph_deposit`, `telegraph_find_intents`, `telegraph_find_miners`,
  `telegraph_intent`, `telegraph_ranking`. This is the agent-facing surface
  our client targets.
- **Anjoman** (anjoman.ai) — the product surface where evaluation work is
  submitted and customer jobs live. "Builders may use Anjoman to make
  optional, real end-to-end demonstrations, but no H2-specific Anjoman role
  or mandatory workflow is required" (bounties docs/H2.md).
- **Bounties repo** — the public work board (gaps → Issues → /claim →
  /progress every 72h → /submit proof → maintainer verifies). At launch every
  bounty is *unfunded*; funded issues publish amount/asset/rules before claims
  open. CLI: `./tb map`, `./tb mission exchange`, `./tb intent <NAME>`,
  `./tb next` (live board needs `gh auth login`). Starring this repo is a
  required part of every H2 entry.
- **Explorer / Discord** — linked from the H2 site for network state and
  support; questions also via the contact email on the /build page.

## Registration & submission (facts)

- Register on the official H2 website; pick track and mission/Intent.
  "Register once and you are eligible for all three tracks." Final entries
  go through the H2 website.
- Registration creates a participant account on the hackathon site itself —
  there is no separate DoraHacks/GitHub-only path. (We did NOT register —
  preparation only, per instructions.)
- Submission contents and judging: see README → "Submission requirements".
- Prizes: $10,000 announced = $7,000 main + $3,000 December challenges.
  Main split: Apps & Agents $3,000, Miners $2,000, Evaluators $2,000.
  Delivery awards prioritise covering more missions / removing blockers;
  a team can win one delivery + one excellence award in the same track.
  Winners must meet published country eligibility, identity and tax checks,
  and payout-method requirements after results/appeals finalise.
- Fair play: one team one identity; fake receipts / manufactured adoption /
  collusive requests = disqualification risk; 72h appeal window after the
  individual provisional-result notice.

## Dates (all UTC)

| When | What |
|---|---|
| 1 Nov | Season II opens (all tracks, all missions) |
| **14 Nov** | **First Integration Milestone** (Apps & Agents): show first working Telegraph request/purchase, an attempt, or the blocker. Progress check — not a disqualifier. |
| 20 Nov | Community showcase |
| Final week | Anjoman hands-on community session (details TBA) |
| **1 Dec 23:59** | **Season II closes** — final deadline, all tracks |
| 2–8 Dec | Verification + judging (planned) |
| From 9 Dec | Provisional results (planned); 72h appeals |
| After 1 Dec | Separate December challenges ($3,000) announced individually |

## Gaps in the public material (to close after registration)

1. Exact hosted MCP endpoint URL and auth issuance flow.
2. Argument schemas for `telegraph_ask_miner`, `telegraph_ranking`,
   `telegraph_deposit`, `telegraph_account` (only `telegraph_docs` is
   publicly schema-documented so far).
3. Standalone testnet faucet URL — none published on the H2 pages or in the
   bounties repo docs; funding appears to be account-based via
   `telegraph_deposit`. Verify via `telegraph_docs` topic "getting started"
   and the H2 Discord.
4. The "testnet standard" referenced by the site nav (§07 Rules teaser) is
   covered in substance by Rules §5/§9: qualifying evidence = reviewer-
   reproduced workflow on the stated network with real Telegraph evidence;
   results are labelled "Mission Verified Testnet / supported network".
