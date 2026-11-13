# Runbook — reproduce the Autonomous Listings Desk from zero

**Telegraph Hackathon Season II · Track 03 (Apps & Agents) · Mission 01: Exchange**

This is the exact, beginner-friendly path a judge or developer can follow
to reproduce what the entry claims: an autonomous agent that buys five
kinds of intelligence through Telegraph (testnet), pays real receipts
from an escrow balance, and returns a listing risk memo with a cost
line. Everything below was executed on 14 Nov 2026; the evidence is in
`docs/INTEGRATION-LOG.md` and the raw transcripts in `out/`.

## 0. What you need

| Prerequisite | Why | Check |
|---|---|---|
| Node.js ≥ 20 (we run v24.22.1) | Runs the desk and the official MCP server | `node --version` |
| npm / npx | Fetches the official MCP server package on demand | `npx --version` |
| This repo, cloned | The desk itself | `ls src/index.js` |
| Internet access | The MCP server talks to the Telegraph node; npx downloads the server once | — |
| ~0.05 Sepolia ETH + 1 test USDC | Gas for the escrow deposit + the escrow balance that pays for asks | see step 3 |

There is **no API key and no hosted endpoint**. The official Telegraph
MCP server is a local stdio program; identity is a wallet file it
creates on your machine. Nothing in this repo contains a key.

## 1. Install / get the code

```sh
git clone <this-repo> telegraph-listings-desk
cd telegraph-listings-desk
npm test        # 11 tests, all offline — must pass before anything else
```

No `npm install` is needed: the desk has zero runtime dependencies
(Node standard library only). The MCP server is fetched by `npx` at
runtime.

## 2. Create the Telegraph wallet (one time)

```sh
npx -y @telegraphprotocol/telegraph-protocol-mcp setup
```

The setup command:

1. checks the node (`https://devnode.telegraphprotocol.com`, beta 2,
   Ethereum Sepolia `eip155:11155111`) is reachable and reports the
   intent count;
2. creates a **dedicated wallet** at `~/.telegraph/wallet.json`
   (mode 0600 — the key never leaves that file and is never printed);
3. asks how much to deposit — answer `0` on a fresh wallet (it is
   empty by construction; funding is step 3).

Our wallet: `0x3C20EE9f54Efe5Ad1377f064c6C0EA8C3a6c0C46`.
Escrow contract: `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b`.
Test USDC token: `0xcc194e1a843B658526D0D5C431f670028582Ae17`.

Without `~/.telegraph/wallet.json` the desk refuses live mode
(`NotRegisteredError`) — there is deliberately no silent fallback to
simulation, because the hackathon rules require accurate claims about
which network produced the evidence.

## 3. Fund the wallet (testnet only)

Asks are paid from escrow, and depositing into escrow is an on-chain
transaction, so the wallet needs two test assets:

1. **Sepolia ETH for gas** — any public Sepolia faucet. We used the
   Google Cloud Web3 faucet: 0.05 ETH, tx
   `0x40d1e36f164053b5d15557ac1b8d3de3443a50a171de0b3687749c468d3e9780`.
2. **Test USDC** — the documented path is the Anjoman faucet
   (https://anjoman.ai/dashboard/faucet, 1 USDC per account per 24h,
   requires an Anjoman sign-in). On 14 Nov that path was a dead end
   for us (the verification email never arrived), so we minted the
   test token directly: Telegraph's test USDC exposes a permissionless
   `mint(address, uint256)`. We minted **exactly the 1 USDC faucet
   amount, no more**, to the wallet: tx
   `0x0d2c51653ae3248d1c2411807368b02038b6a22bf5b69fb91e7cc9bf4760c2cc`
   (block 12127949). Reproduce either way; the amount is what matters.

## 4. Deposit into escrow

```sh
npx -y @telegraphprotocol/telegraph-protocol-mcp fund
```

…or let the desk's client do it programmatically — `telegraph_deposit
{ amount_usd }` exists only when the server is started with
`TELEGRAPH_ALLOW_AGENT_DEPOSIT=1` (our client sets that itself).
Our deposit of 1 USDC (14 Nov 2026):

- approve tx `0x6437535c8f7669ce6f0aab9013e0c92166c57fade6d1ca2f67bc1ac76f0a2d13` (block 12127960)
- depositUSDC tx `0xcfb1fde85e5946be2185e949aeb1477f5103d4c878081c9ed8b83f80ed4ce0ee` (block 12127961)

**Expect the epoch lag.** Right after depositing, `telegraph_account`
reads escrow spendable = 1 from chain, but asks are still refused
`402 … available=0 μUSDC` for several minutes. The node's delivery
check credits a deposit at the **next epoch boundary** (our deposit
landed in epoch 2083; the first settled ask is stamped epoch 2084,
~11 minutes later). Do not re-deposit — nothing is charged by the
refusals; just wait for the next epoch.

## 5. Run the desk

Offline first (fixture miners, receipts watermarked SIMULATED — never
present these as network evidence):

```sh
npm run demo    # evaluates examples/sample-listing.json
```

Live, against the real testnet:

```sh
node src/index.js --live                      # same sample listing
node src/index.js --live --input your.json    # any listing application
```

A listing application is a JSON signal with `tokenName`,
`tokenSymbol`, `chain`, `contractAddress`, `deployer`, and a
`metadata` object (see `examples/sample-listing.json`). Optional:
`metadata.socialAccount` overrides the social handle the desk screens.

What a live run does:

1. **Plans and prices** — for each of the five Mission-01 intents it
   reads the live miner ranking (`telegraph_find_miners` — prices
   live there; `telegraph_ranking` carries none) and takes the #1
   miner. If the planned total exceeds `TELEGRAPH_MAX_SPEND_PER_RUN`
   (default 100) it refuses before spending anything.
2. **Buys** — one `telegraph_ask_miner` per intent (~$0.01 each),
   supplying the params each intent requires (step 6) and falling
   back to node-routed `telegraph_ask` when a miner cannot take its
   intent's params (503 no_compatible_miner).
3. **Decides** — hard vetoes (sanctions score ≥ 90, audit ≥ 85), then
   weighted risk over the intents that returned a derivable score
   (audit 35%, on-chain 25%, wash 20%, social 10%, sanctions 10%);
   `LIST` < 25, `REVIEW` 25–45, `REJECT` ≥ 45. Zero scored answers
   ⇒ REVIEW, never an automatic LIST.
4. **Reports** — prints the memo and writes `out/memo-<timestamp>.md`
   and `.json` (the JSON carries a SHA-256 `memoHash`).

A full live run of five intents costs ≈ **$0.05** of test USDC.
Server-side limits: max $0.50 per ask, $5 per UTC day.

## 6. Intent params the desk supplies (and why)

Verified via `telegraph_intent` (session E3); asks without required
params bounce `400 invalid_params`, uncharged (session E2):

| Live intent | Params sent | From |
|---|---|---|
| `SMART_CONTRACT_AUDIT_GENERAL` | — (takes none) | — |
| `ONCHAIN_METRIC_VERIFY_GENERAL` | `{ address, block, chain: "ethereum", metric: "balance" }` | deployer address; latest Ethereum block from a public RPC |
| `WASH_TRADING_DETECTION_GENERAL` | `{ subject }` | contract address |
| `SOCIAL_BOT_DETECTION_GENERAL` | `{ account }` | `metadata.socialAccount`, else the token name without spaces |
| `SANCTIONS_SCREENING_MATCH_GENERAL` | `{ name }` | token name |

Note the ONCHAIN intent only reads **ethereum / polygon / arbitrum**;
for a subject on another chain the desk reads the *deployer's*
Ethereum balance at the latest block — the same thing the manual
session did. That limitation is the network's, and it is stated here
rather than hidden.

## 7. How answers become risk scores (the adapter)

Miners return intent-shaped answers, not a uniform score. The desk
derives a 0–100 risk score **only** from what the miner itself
returned (`deriveRiskScore` in `src/telegraph/client.js`):

- an explicit `riskScore` / `risk_score` / `risk` field;
- sanctions `matched: true` ⇒ 100 (a fact, and the desk's veto);
  `matched: false` ⇒ the miner's `match_score` × 100, or 0;
- documented 0–1 fractions (`bot_score`, `match_score`) × 100;
- wash trading's own `wash_volume_pct`;
- severity-weighted audit findings (critical 45 / high 25 / medium
  10 / low 3, capped at 100);
- wash trading only: the score the miner states in its own summary
  prose — observed live: “ELEVATED wash-trading risk (score 0.53)”.

Anything else is **unscored**: the purchase still settles and the raw
answer goes into the memo verbatim, but that intent does not feed the
weighted risk. Before this adapter existed, the first unscored answer
(a GHSA-style audit reply with no numeric score) aborted the whole
run with `AnswerShapeError` after the purchase had already settled.
That error class still exists — pass `strictScores: true` to the
client to restore the throw — but the default is: finish the run,
show the evidence, mark the gap.

## 8. Inspect the evidence

- `docs/INTEGRATION-LOG.md` — both milestone sessions, including the
  six settled purchases and their receipt hashes.
- `out/mcp-session-*.json` — full MCP transcripts (handshake,
  tools/list, every call). Re-run any of them with
  `node scripts/mcp-session.mjs scripts/plan-<x>.json out/<y>.json`.
- `out/memo-*.{md,json}` — one pair per desk run.
- `telegraph_account` (free, read-only) shows the wallet, the escrow
  balance and `spent_today_usd` — the accounting judges can check.

## 9. Failure cases worth trying (mission acceptance: “break it”)

- **Empty escrow** → every ask returns the node's 402 body; the desk
  stops with `PaymentRequiredError` quoting the node's exact reason,
  and nothing is charged.
- **Spend ceiling** → `TELEGRAPH_MAX_SPEND_PER_RUN=0.01 node
  src/index.js --live` refuses before any purchase
  (`SpendCeilingError`).
- **Missing wallet** → rename `~/.telegraph/wallet.json` away; live
  mode refuses to start (`NotRegisteredError`).
- **Unscored / failed miner answers** → recorded in the memo; the run
  still completes (see §7).

## 10. Known limitations (honest list)

- Miner answer quality on this beta is noisy; the memo shows raw
  answers so a reviewer can see exactly what was bought. Examples
  from 14 Nov: the wash miner analysed WETH instead of the absent
  subject; the sanctions miner once screened a string parsed from
  the question text. The desk reports these, it does not launder
  them.
- The ONCHAIN intent reads only ethereum/polygon/arbitrum (§6).
- Escrow charges deduct when the epoch closes, so `spendable` can
  read higher than the post-settlement truth until then.
- `memo.signature` is `null`: the memo carries a SHA-256 hash
  (tamper-evident) but is not yet signed with an operator key.
- Simulation mode exists for development and tests; its receipts are
  watermarked `SIMULATED` and are not network evidence.
