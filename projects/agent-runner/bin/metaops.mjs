#!/usr/bin/env node
// The Ads Agent's Ads Manager command: an allowlisted op in the chat's
// client's Meta ad account (docs/build-plans/agents.md, Phase 7).
//
// Allowed to the Ads Agent only (`Bash(node <abs path>:*)` in its bundle, at
// a client). It posts to the app's POST /api/agent-runner/meta-ops, which
// holds the Meta token and decides everything that matters: the op must be
// on its allowlist, the turn must be a running Ads Agent turn at this client,
// and a change needs Jake's Approve on a card that lists that exact change.
// A typed ask never changes anything. This script is a messenger, not a gate.
//
//   node bin/metaops.mjs read.structure
//   node bin/metaops.mjs read.creatives
//   node bin/metaops.mjs pause '{"level":"ad","id":"120...","name":"Winter 2"}'
//
// The runner hands this process AGENT_RUNNER_API, AGENT_TENANT_ID (the chat's
// client) and AGENT_MESSAGE_ID (the turn). Both ids come from the environment
// only: there is no flag for either, so the agent cannot point a call at
// another client or another turn. The secret is NOT in the environment
// (claude may run read-only commands like echo); it is read from Doppler here.

import { execFileSync } from "node:child_process";

// Mirrors META_OPS in apps/command-center/functions/lib/agentMetaOps.ts, for
// a clear error before the network. The app's list is the one that counts.
const OPS = new Set(["read.structure", "read.creatives", "read.library", "pause", "resume", "dailyBudget", "createAd"]);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const [op, rawArgs] = process.argv.slice(2);
if (!op || !OPS.has(op)) fail(`op must be one of: ${[...OPS].join(", ")}`);

let args = {};
if (rawArgs) {
  try {
    args = JSON.parse(rawArgs);
  } catch {
    fail("args must be one JSON object, in single quotes");
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) fail("args must be one JSON object");
}

const tenantId = process.env.AGENT_TENANT_ID || "";
const messageId = process.env.AGENT_MESSAGE_ID || "";
if (!tenantId) fail("no client: Ads Manager changes only happen inside a client's chat");
if (!messageId) fail("no turn id: run this from an agent chat");

function readSecret() {
  try {
    return execFileSync(
      "doppler",
      ["secrets", "get", "AGENT_RUNNER_SECRET", "--plain", "-p", "hauck-command-center", "-c", "prd"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 },
    ).trim();
  } catch {
    return "";
  }
}
const secret = readSecret();
if (!secret) fail("could not read AGENT_RUNNER_SECRET from Doppler on this PC");

const base = (process.env.AGENT_RUNNER_API || "https://app.hauckmarketing.com").replace(/\/+$/, "");
const res = await fetch(`${base}/api/agent-runner/meta-ops`, {
  method: "POST",
  headers: { "x-agent-runner-secret": secret, "content-type": "application/json" },
  body: JSON.stringify({ messageId, tenantId, op, args }),
  signal: AbortSignal.timeout(60_000),
});
const text = await res.text();
if (!res.ok) fail(`meta-ops ${res.status}: ${text.slice(0, 500)}`);
process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
