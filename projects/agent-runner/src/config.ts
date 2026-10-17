// Where things are. The runner lives at projects/agent-runner inside the repo
// and works on the repo's vault, so every path is found from this file rather
// than from the current directory, which the scheduled task does not promise.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNNER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = resolve(RUNNER_DIR, "..", "..");
export const VAULT_DIR = join(REPO_DIR, "vault");
export const AGENTS_DIR = join(RUNNER_DIR, "agents");
export const DATA_DIR = join(RUNNER_DIR, "data");
export const PROMPTS_DIR = join(DATA_DIR, "prompts");
// Agents run here, one folder each, never in the runner's own folder.
export const WORK_DIR = join(DATA_DIR, "work");
// Forward slashes: it is matched as the prefix of a Bash permission rule.
export const META_SCRIPT = join(RUNNER_DIR, "bin", "meta.mjs").split("\\").join("/");
export const SNAPSHOTS_FILE = join(DATA_DIR, "snapshots.json");

// The Google Drive for desktop mount, where every client has a "<handshake>
// Name" folder beside the agency SOPs. Overridable so a second PC with a
// different drive letter does not need a code change.
export const DRIVE_ROOT = process.env.AGENT_DRIVE_ROOT ?? "G:\\My Drive\\\u{1F31F} Hauck Marketing";

export const API_BASE = process.env.AGENT_RUNNER_API ?? "https://app.hauckmarketing.com";

export const POLL_MS = 3_000;
// The page calls the runner online while the newest heartbeat is under 90s
// old. Every 30s leaves room for two to go missing before the footer flips.
export const HEARTBEAT_MS = 30_000;
