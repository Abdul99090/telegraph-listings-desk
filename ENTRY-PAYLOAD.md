# ENTRY PAYLOAD — Telegraph Hackathon Season II (final entry, DO NOT SUBMIT YET)

Prepared 14 Nov 2026. Every field below is copy-ready. The submission
itself is a deliberate final step — see "Remaining steps" at the end.

## Where the final entry is submitted (exact channel)

- **Channel: the official H2 website** — https://hackathon.telegraphprotocol.com
- **How:** sign in with the **registered participant account**
  (bejo · kemzie797b@gmail.com — the account created at registration)
  and complete the **final entry form** in that account. Rules §1:
  *"Final entries go through the H2 website."* Rules §8: *"Submit
  through the official H2 website by December 1, 2026, at 23:59 UTC."*
- **Deadline: 1 Dec 2026, 23:59 UTC = 2 Dec 2026, 06:59 WIB.**
- The form collects exactly the six blocks in Rules §8 (project
  details · short demo · how to run it · evidence · short public
  summary + the five commercial-summary answers · showcase
  permission). There is no separate public form URL — the form lives
  behind the participant login. (The GitHub bounties repo is the
  network's ongoing work board — `/claim` / `/submit` on Issues — it
  is **not** the H2 final-entry channel. Evaluation work goes through
  Anjoman; also not this entry.)
- Questions: the contact email linked on
  https://hackathon.telegraphprotocol.com/build .

## 1. Project details (form block 1)

| Field | Value |
|---|---|
| Project name | Autonomous Listings Desk (Telegraph Listings Desk) |
| Track | Track 03 — Apps & Agents |
| Mission | Mission 01: Exchange |
| Team / contact | bejo (solo) · kemzie797b@gmail.com · Discord Timferris#0 |
| GitHub username that starred the bounties repo | **Abdul99090** (starred github.com/telegraphprotocol/bounties — required entry element, done) |
| Reviewer-access link | ⚠ PENDING — the code repo is currently a local git repo with no remote. Push it public (GitHub, under Abdul99090) and paste the URL here before submitting. |
| Working demo | `node src/index.js --live` from the repo (see How to run) |
| Payout wallet (on file, per entrant instruction 14 Nov 2026) | `0x06994C22E239f4d97661de1A72ee1C0bB18350AD` (burner wallet) |
| Telegraph wallet (evidence, testnet) | `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46` (Ethereum Sepolia) |

Intents purchased (live names): SMART_CONTRACT_AUDIT_GENERAL,
ONCHAIN_METRIC_VERIFY_GENERAL, WASH_TRADING_DETECTION_GENERAL,
SOCIAL_BOT_DETECTION_GENERAL, SANCTIONS_SCREENING_MATCH_GENERAL —
the `*_GENERAL` live variants of Mission 01's catalogue intents
(SMART_CONTRACT_AUDIT, ONCHAIN_METRIC_VERIFY, WASH_TRADING_DETECTION,
SOCIAL_BOT_DETECTION, SANCTIONS_SCREENING_MATCH).

## 2. Short demo (form block 2)

- File: **`video/demo.mp4`** in this repo — 2 min 30 s, 1600×900.
- Content: a real terminal session (recorded with `script`, rendered
  unedited from the typescript): `telegraph_account` before → the
  desk evaluates a listing application live (five paid purchases,
  receipts on screen) → memo with verdict + cost line →
  `telegraph_account` after (`spent_today` $0.13 → $0.18) → receipt
  recap. Testnet only, stated on screen.
- ⚠ PENDING — the form needs an accessible video link: upload
  `video/demo.mp4` (e.g. as a GitHub Release asset on the public
  repo, or YouTube) and paste the URL here before submitting.
- Reproduce the recording: `bash scripts/demo-session.sh` (live),
  then `python3 scripts/render-demo-video.py`.

## 3. How to run it (form block 3)

Full text: **`docs/RUNBOOK.md`** (from zero: prerequisites, wallet
setup via the official MCP `setup`, funding, the epoch lag, the live
run, intent params, the scoring adapter, failure cases, limitations).
Short version for the form:

> Node ≥ 20, no API key, no hosted endpoint. 1) `npm test` (11 tests,
> offline). 2) `npx -y @telegraphprotocol/telegraph-protocol-mcp
> setup` creates a dedicated wallet at ~/.telegraph/wallet.json.
> 3) Fund it with Sepolia ETH (gas) + 1 test USDC, deposit into
> escrow (`fund` / telegraph_deposit), wait one epoch. 4)
> `node src/index.js --live --input your-listing.json`. Network:
> Telegraph testnet beta 2 (Ethereum Sepolia). Cost ≈ $0.05 per
> evaluation (5 asks × $0.01); server limits $0.50/ask, $5/day; desk
> ceiling via TELEGRAPH_MAX_SPEND_PER_RUN.

## 4. Evidence (form block 4)

**Requirement check:** ≥1 genuinely autonomous machine-to-machine
purchase through the supported Telegraph flow — met **18 times**
(18 settled asks, all paid from escrow, all with receipt hashes).

Funding chain (Ethereum Sepolia):

| What | Hash / block |
|---|---|
| Sepolia ETH faucet (0.05 ETH) | tx `0x40d1e36f164053b5d15557ac1b8d3de3443a50a171de0b3687749c468d3e9780`, block 12127803 |
| Test USDC mint (exactly 1 USDC) | tx `0x0d2c51653ae3248d1c2411807368b02038b6a22bf5b69fb91e7cc9bf4760c2cc`, block 12127949 |
| Escrow approve | tx `0x6437535c8f7669ce6f0aab9013e0c92166c57fade6d1ca2f67bc1ac76f0a2d13`, block 12127960 |
| Escrow depositUSDC (1 USDC) | tx `0xcfb1fde85e5946be2185e949aeb1477f5103d4c878081c9ed8b83f80ed4ce0ee`, block 12127961 |

Settled purchases — session 2, 14 Nov 2026 (epoch 2084, $0.01 each):

| Intent | Miner | Receipt hash |
|---|---|---|
| CRYPTO_PRICE_USD | Cp Coinbase (id 190069) | `0x3a2619c003e31a05d84cfc35057f62b878e735825409366a0d65b0258d7b4ca2` |
| SMART_CONTRACT_AUDIT_GENERAL | sca-ghsa | settled via the desk run; proven by delivered answer + `spent_today_usd` 0.01 → 0.02 (receipt body not captured — the pre-adapter crash; see INTEGRATION-LOG session 2 §4) |
| WASH_TRADING_DETECTION_GENERAL | ZK Wash Trading Evidence | `0xd50afebeb13e34d7d9a31f053edc7ed36f913fd269b3e3b6be0274707d6fe355` |
| ONCHAIN_METRIC_VERIFY_GENERAL | LiveCert | `0xec61d213432208c79b85ac112fd6136bed44eb25638cbd90e7edec5e1e7425b7` |
| SOCIAL_BOT_DETECTION_GENERAL | PREFLIGHT (a1-preflight) | `0xe2c2fc74a3eba2fdbd5c66e051c634354ffaf75201a0e7c72c6169989fd6e38b` |
| SANCTIONS_SCREENING_MATCH_GENERAL | ChainSight | `0xe356648430f381dc7ff9ac6e19a5350e09f63f1a76a12e353391e0fb0c2a73d9` |

Settled purchases — adapter verification run, 14 Nov 2026
(`node src/index.js --live`, first full unattended desk run;
memo `out/memo-2026-11-13T19-56-29-492Z.*`, verdict REJECT 77.3):

| Intent | Receipt hash |
|---|---|
| SMART_CONTRACT_AUDIT_GENERAL | `0xdc7e4df1c3d6f926331a5b346c9a368c34a7adda897c8b56f451394d4e5b3948` |
| ONCHAIN_METRIC_VERIFY_GENERAL | `0xc57f8c39d3be51f54663fb900ec97ced543067eb92d5e6aeeb8caa34f84f324b` |
| WASH_TRADING_DETECTION_GENERAL | `0x92b14acbf4dc887846c2f026ac44b66cd9f98f60f2959cf7635c6145dc3e6028` |
| SOCIAL_BOT_DETECTION_GENERAL | `0x80c6d07dd3ef7d6ad7fc66e004b64a5f264189446b1acc1554b0c4f68ee077bd` |
| SANCTIONS_SCREENING_MATCH_GENERAL | `0x3dcac1b82270ad82395a7821b4a64f5c1a5a26a95ecbcd9ffe832315b3a2b9e5` |

Settled purchases — recorded demo run, 14 Nov 2026 (the run in
`video/demo.mp4`; memo `out/memo-2026-11-13T20-08-03-089Z.*`,
verdict REJECT 76.7, `spent_today` $0.13 → $0.18 on screen):

| Intent | Receipt hash |
|---|---|
| SMART_CONTRACT_AUDIT_GENERAL | `0x5ac5a0a68eb4660d26656046142c0463e5ff0c706346f2bb529ca599d5f52116` |
| ONCHAIN_METRIC_VERIFY_GENERAL | `0x00ba55382694fef56982909e9ea4e7a76e1dc1586a9bca86394a34f7eee03dda` |
| WASH_TRADING_DETECTION_GENERAL | `0xecbf4d2e52fd103a1ae749546fdb7193062ffdca95f4a043335e01f4a203d7b8` |
| SOCIAL_BOT_DETECTION_GENERAL | `0x8213f93a0934baab9b5f2be4e98ae1714b17fa606127180497762588b3b61377` |
| SANCTIONS_SCREENING_MATCH_GENERAL | `0x1686863e05ff895ac6399bc7dac41c7101cf07b06d00cfe4360d9e7f8099fcd0` |

Plus two single-ask answer-shape probes (session F2): SOCIAL
`0xe5ca519ce71222a256dacf3f93d159044a87b76cdc370c69f235ac2090307fdc`
and one audit ask (receipt in `out/mcp-session-f2-shapes.json`).

Accounting: `telegraph_account` — deposited 1 USDC, `spent_today_usd`
reached **0.18** across 14 Nov's runs (escrow charges deduct at epoch
close; effective remaining ≈ $0.82). Full MCP transcripts:
`out/mcp-session-*.json`. Tests: `npm test` — 11 passing. Story:
`docs/INTEGRATION-LOG.md` (sessions 1–3).

## 5. Short public summary (form block 5)

> **Autonomous Listings Desk** — an agent that does the due diligence
> for a token listing decision by *buying* it. When a listing
> application arrives, the desk prices five Telegraph intents from
> the live rankings (contract audit, on-chain verification,
> wash-trading detection, social bot detection, sanctions
> screening), buys one answer per intent from the #1-ranked miner
> (~$0.01 each, paid from escrow with a real receipt), and returns a
> tamper-evident listing risk memo with a verdict and a cost line.
> It serves Mission 01: Exchange (Track 03, Apps & Agents). What
> works today, on Telegraph testnet (beta 2): the full loop —
> plan → price → buy → decide → memo — runs unattended; 18 settled
> purchases with receipts; a scoring adapter that derives risk only
> from what miners actually return and marks the rest unscored
> instead of inventing numbers. Try it: clone the repo, `npm test`,
> create a wallet with the official MCP `setup`, fund the escrow
> with test USDC, and run `node src/index.js --live` — full steps in
> docs/RUNBOOK.md. Honest limitations: miner answer quality on the
> beta is noisy (raw answers are shown in every memo), the on-chain
> intent reads only Ethereum/Polygon/Arbitrum, and all evidence is
> testnet.

Public updates (growth points — links to paste here):
⚠ PENDING — publish ≥3 original updates on separate dates (intro →
integration → working result; tag @Telegraphprotoc on X, link the
repo/RUNBOOK) and list their URLs here before submitting.

## 6. Commercial summary (form block 5, Rules §8 answers)

**Who is the user or buyer, and how often do they have this problem?**
Listing teams at spot/derivatives venues and aggregators (Mission 01
names venues like Kraken, Gate.io, Binance as the buyer class) —
every listing application needs the same five checks, and
applications arrive daily. A solo desk today does them by hand across
five different tools; the desk buys them as graded intelligence in
one run for ≈ $0.05 of testnet credit at beta prices.

**A useful flow for the demo** (what the video shows):
1. **Problem** — a listing application (MoonPanda Inu) needs a
   go/no-go decision with evidence.
2. **Telegraph request** — the desk plans from live rankings and
   sends five `telegraph_ask_miner` purchases with the params each
   intent requires.
3. **Intelligence and Provider evidence** — answers return from the
   #1-ranked miners (sca-ghsa, LiveCert, ZK Wash Trading Evidence,
   PREFLIGHT, ChainSight), each with a payment receipt.
4. **Observed cost** — 5 paid requests · 5 receipts · $0.05 total;
   `spent_today` on the account moves $0.13 → $0.18.
5. **Completed result** — a risk memo: REJECT (weighted risk 76.7),
   sanctions veto fired, memo hash `cc4ac0f1…faa1`.
6. **How to try it** — docs/RUNBOOK.md, from zero, in this repo.

All results are testnet; no customer demand is claimed.

## 7. Showcase permission (form block 6) — DRAFT, confirm at submit time

> You may share this project's text, screenshots, the demo video and
> the runbook publicly. Buyer introductions: **opt in**.

## Remaining steps before the entry can be submitted

1. **Push this repo public** (GitHub, account Abdul99090) and fill
   the reviewer-access link in block 1. (Commits are local; no
   remote is configured yet.)
2. **Host the demo video** at a public URL (GitHub Release asset or
   YouTube) and fill the link in block 2.
3. **Publish the ≥3 public updates** on separate dates and fill
   their links in block 5. (20 of 100 judging points.)
4. Confirm the showcase-permission wording (block 7) and the payout
   wallet in block 1.
5. Sign in at hackathon.telegraphprotocol.com as bejo, complete the
   final entry form with the blocks above, submit **before
   1 Dec 2026 23:59 UTC (2 Dec 06:59 WIB)**.
6. Optional while escrow remains (≈ $0.82): evaluate 1–2 more
   listing inputs live so the evidence covers more than one subject.
