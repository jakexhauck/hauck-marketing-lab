// An agent is a fixed bundle: its own instructions, its own allowed tools, and
// the brains it may draw on. The rail row Jake picked decides the bundle; the
// chat decides nothing about it.
//
// The system prompt is written to a file per agent and client and passed with
// --append-system-prompt-file, so Claude Code keeps its own system prompt (and
// its tool know-how) and ours goes on the end. It is rewritten every turn, so a
// lesson saved a minute ago is in the next answer.
//
// Tools are an allowlist, and `claude -p` denies anything not on it, since
// there is nobody at a prompt to say yes. Bash is never allowed bare: the only
// shell command any agent can run is the read-only Meta script, and only the
// three agents whose job needs numbers get it. Meta writes are refused by the
// app's endpoint as well, so this is the second lock, not the only one.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentDef, AGENTS } from "./agents.ts";
import { readLessons } from "./brain.ts";
import type { Bundle } from "./claude.ts";
import { findDriveFolder, vaultFolder } from "./clients.ts";
import { AGENTS_DIR, DRIVE_ROOT, PROMPTS_DIR, VAULT_DIR } from "./config.ts";
import { stripEmDashes } from "./output.ts";
import type { AgentId, ClaimTenant } from "./wire.ts";

export type { Bundle };

export interface BundleEnv {
  vaultDir: string;
  agentsDir: string;
  outDir: string;
  driveRoot: string;
}

export const defaultBundleEnv = (): BundleEnv => ({
  vaultDir: VAULT_DIR,
  agentsDir: AGENTS_DIR,
  outDir: PROMPTS_DIR,
  driveRoot: DRIVE_ROOT,
});

export const META_TOOL = "Bash(node bin/meta.mjs:*)";

// Read, search and the web for everyone; writing only where the job is to
// produce files (Drive docs, drafts). The GHL Agent reads only in Phase 1: its
// GHL writes arrive in Phase 4, through the app, behind Jake's click.
const READ = ["Read", "Glob", "Grep"];
const WEB = ["WebSearch", "WebFetch"];
const WRITE = ["Write", "Edit"];

const TOOLS: Record<AgentId, string[]> = {
  manager: [...READ, META_TOOL],
  research: [...READ, ...WEB, ...WRITE],
  ads: [...READ, ...WEB, ...WRITE, META_TOOL],
  creative: [...READ, ...WEB, ...WRITE],
  landing: [...READ, ...WEB, ...WRITE],
  ghl: [...READ],
  reporting: [...READ, ...WRITE, META_TOOL],
};

export function allowedToolsFor(agent: AgentId): string[] {
  return [...TOOLS[agent]];
}

export function clientBrainPath(vaultDir: string, t: Pick<ClaimTenant, "slug" | "name">): string {
  return join(vaultDir, "Clients", vaultFolder(t), "Brain.md");
}

export function agentBrainPath(vaultDir: string, agent: AgentId): string {
  return join(vaultDir, "Agents", agentDef(agent).folder, "Brain.md");
}

function readOr(file: string, fallback = ""): string {
  return existsSync(file) ? readFileSync(file, "utf8").trim() : fallback;
}

function lessonLines(file: string): string {
  const lines = readLessons(file).map((l) => `- [${l.learnedOn}] (${l.agent}, ${l.source}) ${l.text} ^${l.id}`);
  return lines.length ? lines.join("\n") : "(none yet)";
}

// Every brain on disk, for the Manager's Mega Brain: each client's, then each
// agent's. The cross-client "seen at 4 of 5" reasoning needs them side by side.
function megaBrain(vaultDir: string): string {
  const parts: string[] = [];
  const clientsDir = join(vaultDir, "Clients");
  if (existsSync(clientsDir)) {
    for (const name of readdirSync(clientsDir).sort()) {
      const f = join(clientsDir, name, "Brain.md");
      if (existsSync(f)) parts.push(`### Client: ${name}\n${lessonLines(f)}`);
    }
  }
  for (const a of AGENTS) {
    const f = agentBrainPath(vaultDir, a.id);
    if (existsSync(f)) parts.push(`### Agent: ${a.name}\n${lessonLines(f)}`);
  }
  return parts.join("\n\n") || "(none yet)";
}

function clientSection(env: BundleEnv, tenant: ClaimTenant | null, drive: string | null): string {
  if (!tenant) return "## Client\nNone. This is the agency Manager chat: it overlooks every client at once.";
  const folder = join(env.vaultDir, "Clients", vaultFolder(tenant));
  return [
    "## Client",
    `- Name: ${tenant.name}`,
    `- Slug: ${tenant.slug}`,
    `- Tenant id: ${tenant.id}`,
    `- Meta ad account: ${tenant.metaAdAccountId ? "connected" : "none"}`,
    `- Vault notes: ${folder} (Profile.md, Memory.md)`,
    `- Drive folder: ${drive ?? "not found on this PC"}`,
  ].join("\n");
}

export function buildBundle(agent: AgentId, tenant: ClaimTenant | null, env: BundleEnv = defaultBundleEnv()): Bundle {
  const def = agentDef(agent);
  const drive = tenant ? findDriveFolder(env.driveRoot, tenant) : null;

  const sections = [
    readOr(join(env.agentsDir, `${agent}.md`), `# ${def.name}`),
    clientSection(env, tenant, drive),
    readOr(join(env.agentsDir, "_rules.md")),
    readOr(join(env.agentsDir, "_protocol.md")),
  ];
  if (agent === "manager") {
    sections.push(`## Mega Brain\n${megaBrain(env.vaultDir)}`);
  } else {
    if (tenant) sections.push(`## Client brain (${tenant.name})\n${lessonLines(clientBrainPath(env.vaultDir, tenant))}`);
    sections.push(`## Your brain (${def.name})\n${lessonLines(agentBrainPath(env.vaultDir, agent))}`);
  }

  mkdirSync(env.outDir, { recursive: true });
  const systemPromptFile = join(env.outDir, `${agent}-${tenant?.slug ?? "agency"}.md`);
  // Brains are hand-editable in Obsidian, so an em dash can come in from there
  // too. The agent copies what it reads; take them out before it reads them.
  writeFileSync(systemPromptFile, stripEmDashes(sections.filter(Boolean).join("\n\n")) + "\n");

  const addDirs = [env.vaultDir];
  if (drive) addDirs.push(drive);
  return { systemPromptFile, allowedTools: allowedToolsFor(agent), addDirs };
}
