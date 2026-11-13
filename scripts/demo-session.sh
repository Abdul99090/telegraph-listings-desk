#!/usr/bin/env bash
# The recorded demo session for video/demo.mp4 — see scripts/render-demo-video.py
# for how the typescript becomes the video. Everything between the cards is a
# real live session (scripts/demo-live.mjs); nothing is simulated or edited.
set -u
cd "$(dirname "$0")/.."

cat <<'EOF'
================================================================================
  TELEGRAPH LISTINGS DESK - LIVE DEMO
  Telegraph Hackathon Season II - Track 03 (Apps & Agents) - Mission 01: Exchange

  An autonomous agent buys the intelligence a listing decision needs -
  contract audit, on-chain verification, wash-trading detection, social
  bot detection, sanctions screening - through Telegraph, pays for it
  from escrow with real receipts, and returns a signed-hash risk memo.

  Network: Telegraph testnet (beta 2, Ethereum Sepolia). This is a real
  terminal session: real MCP server, real escrow, real settled receipts.
================================================================================
EOF
sleep 5

node scripts/demo-live.mjs 2>&1

cat <<'EOF'

================================================================================
  Demo end. The memo is in out/, full MCP transcripts in out/mcp-session-*.json,
  the story in docs/INTEGRATION-LOG.md, reproduction steps in docs/RUNBOOK.md.
  Testnet evidence only - no mainnet funds were used or claimed.
================================================================================
EOF
sleep 6
