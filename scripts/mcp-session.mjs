#!/usr/bin/env node
/**
 * Minimal MCP stdio client for the official Telegraph MCP server
 * (@telegraphprotocol/telegraph-protocol-mcp). Spawns the server,
 * performs the initialize handshake, dumps tools/list, then runs a
 * battery of tools/call steps and records a full transcript.
 *
 * Usage:
 *   node scripts/mcp-session.mjs <plan.json> <transcript-out.json>
 *
 * Plan JSON: { "env": { "TELEGRAPH_ALLOW_AGENT_DEPOSIT": "1" },
 *              "steps": [ { "tool": "telegraph_docs",
 *                           "arguments": { "topic": "payments" } },
 *                         { "tool": "tools/list" } ] }
 *
 * A step with tool "tools/list" issues a tools/list request instead of
 * a tools/call. Every request/response pair is written to the
 * transcript file, and a one-line summary per step goes to stdout.
 * The server wallet (~/.telegraph/wallet.json) is managed by the
 * server itself; this script never reads it.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const [planPath, outPath] = process.argv.slice(2);
if (!planPath || !outPath) {
  console.error("usage: node scripts/mcp-session.mjs <plan.json> <transcript-out.json>");
  process.exit(2);
}
const plan = JSON.parse(await readFile(planPath, "utf8"));

const child = spawn("npx", ["-y", "@telegraphprotocol/telegraph-protocol-mcp"], {
  env: { ...process.env, ...(plan.env ?? {}) },
  stdio: ["pipe", "pipe", "pipe"],
});
let stderrBuf = "";
child.stderr.on("data", (d) => (stderrBuf += d.toString()));

let nextId = 1;
const pending = new Map();
let buf = "";
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // non-JSON noise on stdout
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function request(method, params, timeoutMs = 120000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout after ${timeoutMs}ms waiting for ${method} (id ${id})`));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const transcript = { startedAt: new Date().toISOString(), plan: planPath, steps: [] };

const init = await request("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "telegraph-listings-desk-probe", version: "0.1.0" },
});
transcript.initialize = init;
console.log(
  "initialize ->",
  JSON.stringify(init.result?.serverInfo ?? init.error ?? init).slice(0, 300),
);
notify("notifications/initialized", {});

for (const step of plan.steps) {
  const label = step.tool === "tools/list" ? "tools/list" : `tools/call ${step.tool}`;
  const t0 = Date.now();
  try {
    const res =
      step.tool === "tools/list"
        ? await request("tools/list", {})
        : await request("tools/call", { name: step.tool, arguments: step.arguments ?? {} });
    const ms = Date.now() - t0;
    transcript.steps.push({ label, arguments: step.arguments ?? null, ms, response: res });
    const summary = res.error
      ? `ERROR ${JSON.stringify(res.error).slice(0, 400)}`
      : JSON.stringify(res.result).slice(0, 400);
    console.log(`${label} (${ms}ms) -> ${summary}`);
  } catch (err) {
    transcript.steps.push({ label, arguments: step.arguments ?? null, error: String(err) });
    console.log(`${label} -> FAILED ${err.message}`);
  }
}

transcript.stderr = stderrBuf.slice(0, 4000);
transcript.finishedAt = new Date().toISOString();
await writeFile(outPath, JSON.stringify(transcript, null, 2));
console.log(`transcript written to ${outPath}`);
child.kill("SIGTERM");
process.exit(0);
