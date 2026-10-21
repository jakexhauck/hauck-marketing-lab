// Where things are. The runner lives at projects/agent-runner inside the repo
// and works on the repo's vault, so every path is found from this file rather
// than from the current directory, which the scheduled task does not promise.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentList } from "./agents.ts";

export const RUNNER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = resolve(RUNNER_DIR, "..", "..");
export const VAULT_DIR = join(REPO_DIR, "vault");
export const AGENTS_DIR = join(RUNNER_DIR, "agents");
export const DATA_DIR = join(RUNNER_DIR, "data");
export const PROMPTS_DIR = join(DATA_DIR, "prompts");
// Agents run here, one folder each, never in the runner's own folder.
export const WORK_DIR = join(DATA_DIR, "work");
// The runner's own state per agent and client (what it staged for which
// card, prepared clips). Beside data/work, never in it: an agent can write
// anywhere in its work folder.
export const STATE_DIR = join(DATA_DIR, "state");
// Forward slashes: it is matched as the prefix of a Bash permission rule.
export const META_SCRIPT = join(RUNNER_DIR, "bin", "meta.mjs").split("\\").join("/");
// The GHL Agent's one command, same rules as the meta script.
export const GHL_SCRIPT = join(RUNNER_DIR, "bin", "ghl.mjs").split("\\").join("/");
// The Ads Agent's Ads Manager command (Phase 7), same rules again.
export const METAOPS_SCRIPT = join(RUNNER_DIR, "bin", "metaops.mjs").split("\\").join("/");
export const SNAPSHOTS_FILE = join(DATA_DIR, "snapshots.json");

// Landing pages the runner deployed: a snapshot per card, copied out of the
// agent's work folder so the agent cannot change a page after Jake saw it.
// Wrangler runs in its own empty folder (see pages.ts for why).
export const SITES_DIR = join(DATA_DIR, "sites");
export const PAGES_CWD = join(DATA_DIR, "pages-cwd");

// The Google Drive for desktop mount, where every client has a "<handshake>
// Name" folder beside the agency SOPs. Overridable so a second PC with a
// different drive letter does not need a code change.
export const DRIVE_ROOT = process.env.AGENT_DRIVE_ROOT ?? "G:\\My Drive\\\u{1F31F} Hauck Marketing";

export const API_BASE = process.env.AGENT_RUNNER_API ?? "https://app.hauckmarketing.com";

export const POLL_MS = 3_000;
// The page calls the runner online while the newest heartbeat is under 90s
// old. Every 30s leaves room for two to go missing before the footer flips.
export const HEARTBEAT_MS = 30_000;

// The agents this runner claims. The VPS runner answers the Hermes agents and
// the PC runner the rest; unset means all of them (one runner, as before).
export const CLAIM_AGENTS = parseAgentList(process.env.AGENT_AGENTS);

// Which engine answers: "claude" (claude -p on this machine, the default) or
// "hermes" (the agent's Hermes profile, docs/build-plans/hermes-agents.md).
export const ENGINE: "claude" | "hermes" = process.env.AGENT_ENGINE === "hermes" ? "hermes" : "claude";
// The Hermes gateway. On the VPS the runner reaches it by its Docker name.
export const HERMES_API = process.env.HERMES_API ?? "http://hermes-agent:8642";
