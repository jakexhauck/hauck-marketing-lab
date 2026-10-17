#!/usr/bin/env node
// Meta insights for the Ads, Reporting and Manager agents. READ ONLY.
//
// The only shell command those agents are allowed (`Bash(node bin/meta.mjs:*)`
// in their bundle). It asks the app's GET /api/agent-runner/meta, which holds
// the Meta token and only ever calls Graph GETs. There is no write here to
// misuse, and none behind it either.
//
//   node bin/meta.mjs                         account level, last 7 days
//   node bin/meta.mjs --level campaign --days 30
//   node bin/meta.mjs --level ad --days 14 --tenant <tenant id>
//
// The runner hands this process AGENT_RUNNER_API, AGENT_RUNNER_SECRET and
// AGENT_TENANT_ID (the chat's client) in its environment, so the agent never
// sees the secret and does not need to know the tenant id.

const LEVELS = new Set(["account", "campaign", "ad"]);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const level = arg("level", "account");
const days = Number(arg("days", "7"));
const tenant = arg("tenant", process.env.AGENT_TENANT_ID || "");
const base = (process.env.AGENT_RUNNER_API || "https://app.hauckmarketing.com").replace(/\/+$/, "");
const secret = process.env.AGENT_RUNNER_SECRET || "";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!LEVELS.has(level)) fail(`--level must be account, campaign or ad (got ${level})`);
if (!Number.isInteger(days) || days < 1 || days > 90) fail("--days must be a whole number from 1 to 90");
if (!tenant) fail("no client: this chat has no tenant, pass --tenant <id>");
if (!secret) fail("AGENT_RUNNER_SECRET is not set; run this through the agent runner");

const qs = new URLSearchParams({ tenant, level, days: String(days) });
const res = await fetch(`${base}/api/agent-runner/meta?${qs}`, {
  headers: { "x-agent-runner-secret": secret },
  signal: AbortSignal.timeout(60_000),
});
const text = await res.text();
if (!res.ok) fail(`meta ${res.status}: ${text.slice(0, 500)}`);
process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
