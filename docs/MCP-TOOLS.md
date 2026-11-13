# Telegraph MCP — live tools/list dump

Captured **14 Nov 2026** from the real server during the first-integration
milestone session (see `docs/INTEGRATION-LOG.md`). Raw machine dump:
`docs/tools-list-full.json`; full session transcripts: `out/mcp-session-*.json`
(reproduce with `scripts/mcp-session.mjs` + the plan files in `scripts/`).

## How the server is reached (this corrects the scaffold's assumption)

There is **no hosted HTTP endpoint and no API key**. The official MCP server
is a local **stdio** server:

- Package: `@telegraphprotocol/telegraph-protocol-mcp` (npm, official org)
- Launch: `npx -y @telegraphprotocol/telegraph-protocol-mcp`
- Server identity from `initialize`: `{"name": "telegraph", "version": "2.0.0"}`
  (protocol negotiated: 2025-03-26)
- Node it talks to: `https://devnode.telegraphprotocol.com` ("beta 2")
- Chain: Ethereum Sepolia, `eip155:11155111`
- Identity/payment: a dedicated wallet the official `setup` command creates
  at `~/.telegraph/wallet.json` (mode 0600). The server signs escrow
  authorisations itself; the agent never sees the key.
- Escrow contract: `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b`
- Test USDC (Telegraph's own, not Circle's):
  `0xcc194e1a843B658526D0D5C431f670028582Ae17`
- Default limits: max $0.50 per ask, $5 per UTC day
  (`TELEGRAPH_MAX_ASK_USD`, `TELEGRAPH_DAILY_LIMIT_USD`).
- `telegraph_deposit` is **only exposed when the server is started with
  `TELEGRAPH_ALLOW_AGENT_DEPOSIT=1`** — the default tools/list has 8 tools,
  the deposit-enabled list has 9. Both were captured.

## Tools (9)

### telegraph_ask — paid (~$0.01)

Ask the Telegraph network a question: live prices, FX, weather, web and
academic search, security, code review, compliance and 100+ other intents.
The node routes it to the best-ranked live miner and returns its answer in
the intent's fields. Costs about $0.01, paid automatically from the
Telegraph escrow balance (a failed ask is never billed; repeating the same
ask within a minute is not paid twice).

```json
{"type":"object","properties":{"question":{"type":"string","description":"The question, in plain words."},"intent":{"type":"string","description":"Optional exact intent, e.g. CRYPTO_PRICE_USD (see telegraph_find_intents). Only that intent's miners answer."},"params":{"type":"object","additionalProperties":{},"description":"Optional params for the intent, as telegraph_intent lists them, e.g. {\"location\": \"Lahore\"}. Needs intent."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

Annotations: `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true`

### telegraph_ask_miner — paid (the miner's price)

Ask one specific miner (by id or slug from telegraph_find_miners) instead of
letting the node pick. Send a question (with intent when the miner serves
several), or call one of its endpoints directly with endpoint, method and
payload (the raw answer comes back). No fallback miner is tried. Paid like
telegraph_ask, at that miner's price.

```json
{"type":"object","properties":{"miner":{"type":"string","description":"Miner id or slug."},"question":{"type":"string","description":"The question, in plain words."},"intent":{"type":"string","description":"Optional exact intent, e.g. CRYPTO_PRICE_USD (see telegraph_find_intents). Only that intent's miners answer."},"params":{"type":"object","additionalProperties":{},"description":"Optional params for the intent, as telegraph_intent lists them, e.g. {\"location\": \"Lahore\"}. Needs intent."},"endpoint":{"type":"string","description":"Direct call: the miner's endpoint path, e.g. /query (telegraph_find_miners lists them)."},"method":{"type":"string","enum":["GET","POST"],"description":"Direct call: HTTP method (default GET)."},"payload":{"type":"object","additionalProperties":{},"description":"Direct call: the body or query fields the endpoint takes."}},"required":["miner"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

Annotations: `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true`

### telegraph_find_intents — free, read-only

Search the intents (kinds of question) the network answers, with how many
miners serve each. Free. Without search, lists every intent name.

```json
{"type":"object","properties":{"search":{"type":"string","description":"Words to look for, e.g. 'weather', 'bitcoin price', 'code review'."},"limit":{"type":"integer","minimum":1,"maximum":200,"description":"Most results to return (default 10)."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

### telegraph_intent — free, read-only

One intent: its kind (deterministic, hybrid or judgment), the params an ask
can send, the fields the answer comes back in, and its top-ranked miners.

```json
{"type":"object","properties":{"intent":{"type":"string","description":"Intent name, e.g. WEATHER_CHECK_TEMPERATURE."}},"required":["intent"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

### telegraph_find_miners — free, read-only

Miners for an intent, best-ranked first, with status, price and rank; or
miners whose name or description match some words.

```json
{"type":"object","properties":{"intent":{"type":"string","description":"Intent name; lists that intent's miners with their rank."},"search":{"type":"string","description":"Words every listed miner must match (slug, name, description)."},"limit":{"type":"integer","minimum":1,"maximum":100,"description":"Most miners to return (default 20)."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

### telegraph_ranking — free, read-only

The latest epoch's miner ranking (scores from the network's own checks),
for one intent or the top few of every intent. Asks go to the top live
miner. **Note:** ranking entries carry `rank`, `miner` (slug), `score`,
`status` — **no price**. Prices come from `telegraph_find_miners`
(`price_usd`).

```json
{"type":"object","properties":{"intent":{"type":"string","description":"Intent name. Empty: every ranked intent."},"limit":{"type":"integer","minimum":1,"maximum":50,"description":"Miners per intent (default 10 for one intent, 3 for all)."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

### telegraph_account — free, read-only

This server's wallet (or any address): its address and network, wallet USDC
and ETH, the Telegraph escrow balance that pays for asks (spendable,
deposited, debt, pending withdrawal), the spending limits, and how to top
up.

```json
{"type":"object","properties":{"address":{"type":"string","description":"Address to look up. Default: this server's wallet."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

### telegraph_docs — free, read-only

How Telegraph works: getting started, payments, intents and ranking,
errors. **The live topic enum is kebab-case** —
`getting-started | payments | intents-and-ranking | troubleshooting` —
not the "getting started" / "errors" spellings the scaffold assumed
(calling it with `"getting started"` returns MCP error -32602 with the
valid enum in the message).

```json
{"type":"object","properties":{"topic":{"type":"string","enum":["getting-started","payments","intents-and-ranking","troubleshooting"],"description":"A topic to read in full."},"search":{"type":"string","description":"Words to look up across the docs."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

### telegraph_deposit — moves funds (only with TELEGRAPH_ALLOW_AGENT_DEPOSIT=1)

Move USDC from this server's wallet into its Telegraph escrow balance
(approve, then depositUSDC on chain; needs a little ETH for gas). Escrow
then pays for asks. Confirm the amount with the user first.

```json
{"type":"object","properties":{"amount_usd":{"type":"number","exclusiveMinimum":0,"maximum":10000,"description":"USDC to deposit, e.g. 1 or 5."}},"required":["amount_usd"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
```

## Result shape (all tools)

Results come back as MCP `content: [{type: "text", text: "…"}]`. The text
is a JSON string for data tools (account, intent, find_miners, ranking,
find_intents) and markdown for `telegraph_docs`. Tool-level failures set
`isError: true` with the message in the text (e.g. deposit:
`"The wallet holds 0 USDC, less than 1."`).

**Payment refusal is NOT a tool error.** An ask the escrow cannot cover
returns a normal result whose text is:

```json
{
  "status": 402,
  "error": "payment required",
  "reason": "insufficient escrow for delivery: committed=0 μUSDC + price=10000 μUSDC > available=0 μUSDC",
  "hint": "Payment from escrow refused (…), and nothing was charged. telegraph_account shows the balance and anything owed; the user fixes it by running `npx -y @telegraphprotocol/telegraph-protocol-mcp fund` in a terminal and confirming the amount.",
  "payment": { "rail": "escrow", "price_usd": 0.01, "escrow": "insufficient escrow for delivery: …" }
}
```

(Observed verbatim 14 Nov 2026 for both `telegraph_ask` and
`telegraph_ask_miner`; price 10000 μUSDC = $0.01. A *successful* paid
answer's exact shape is still unobserved — the escrow was empty; see
INTEGRATION-LOG → blockers. The client treats the success shape
defensively and refuses to invent a risk score.)

## Live intent catalogue vs Mission 01 names

The bounties catalogue names Mission 01 intents without a suffix
(`SMART_CONTRACT_AUDIT`, …). On the live beta-2 network those bare names
exist but have **zero miners** (`telegraph_intent SMART_CONTRACT_AUDIT` →
`miners: 0`, "Not ranked yet"). The served intents are the `*_GENERAL`
family variants — 136 intents total at capture. Verified live mapping
(miner counts at 14 Nov 2026, epoch 2083):

| Mission 01 (catalogue) | Live intent | Kind | Miners |
|---|---|---|---|
| SMART_CONTRACT_AUDIT | SMART_CONTRACT_AUDIT_GENERAL | judgment | 18 |
| SECURITY_REVIEW | SECURITY_REVIEW_GENERAL | — | 32 |
| ONCHAIN_METRIC_VERIFY | ONCHAIN_METRIC_VERIFY_GENERAL | — | 44 |
| TOKEN_TOTAL_SUPPLY_VERIFY | TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL | — | 24 |
| SANCTIONS_SCREENING_MATCH | SANCTIONS_SCREENING_MATCH_GENERAL | — | 20 |
| SOCIAL_BOT_DETECTION | SOCIAL_BOT_DETECTION_GENERAL | — | 16 |
| WASH_TRADING_DETECTION | WASH_TRADING_DETECTION_GENERAL | — | 16 |
| LIQUIDITY_DEPTH_VERIFY | LIQUIDITY_DEPTH_VERIFY_GENERAL | — | 37 |

`SMART_CONTRACT_AUDIT_GENERAL` detail (telegraph_intent): kind `judgment`,
`params: []`, `answer_fields: []`, top-ranked miner `sca-ghsa`
(id `151007`, "GHSA Audit Advisories", price $0.01, rank 1, score 1).
`CRYPTO_PRICE_USD` is a bare-named intent with 54 miners.
