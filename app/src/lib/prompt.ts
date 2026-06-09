import type { AgentSummary, ChatTurn, KnowledgeChunk, VaultNote } from "./types";

/**
 * Strip YAML frontmatter from a markdown body.
 * Mirrors the Rust splitter in src-tauri/src/frontmatter.rs.
 */
function stripFrontmatter(md: string): string {
  const trimmed = md.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return trimmed;
  const after = trimmed.slice(3).replace(/^\n/, "");
  const end = after.indexOf("\n---");
  if (end === -1) return trimmed;
  return after.slice(end + 4).replace(/^\n/, "");
}

function appendVaultSections(
  lines: string[],
  aboutNotes: VaultNote[] | undefined,
  clientNotes: VaultNote[] | undefined,
  clientName: string,
): void {
  const about = aboutNotes ?? [];
  if (about.length > 0) {
    lines.push("");
    lines.push("# About");
    lines.push("");
    for (const note of about) {
      lines.push(note.body.trim());
      lines.push("");
    }
  }

  const client = clientNotes ?? [];
  if (client.length > 0) {
    lines.push("");
    lines.push(`# Client context: ${clientName}`);
    lines.push("");
    for (const note of client) {
      const body = note.body.trim();
      if (body.length === 0) continue;
      lines.push(body);
      lines.push("");
    }
  }
}

/**
 * Assemble the full prompt sent to `claude -p` for one turn.
 *
 * Section order:
 *   1. Preamble (you are X, address Jake as Sir, dry wit)
 *   2. # About — Jake.md + Hauck Marketing.md from the vault
 *   3. # Client context — Profile.md + Memory.md + Drive Index.md (active client)
 *   4. # Persona — the agent body markdown
 *   5. # Reference knowledge — optional keyword-routed chunks (legacy router)
 *   6. # Conversation so far — full history replayed each turn
 *   7. # New message from Jake
 *
 * Vault sections are passed in by the caller (see ChatDrawer / DiagnosisForm).
 * The caller is responsible for fetching them via api.readAboutNotes /
 * api.readClientNotes — this keeps prompt.ts pure.
 */
export function assemblePrompt(opts: {
  agent: AgentSummary;
  agentBody: string;
  history: ChatTurn[];
  userInput: string;
  clientName?: string;
  knowledgeChunks?: KnowledgeChunk[];
  aboutNotes?: VaultNote[];
  clientNotes?: VaultNote[];
}): string {
  const persona = stripFrontmatter(opts.agentBody).trim();
  const client = opts.clientName ?? "Willis Windows";

  const lines: string[] = [];
  lines.push(
    `You are ${opts.agent.name}, an AI agent in Jake Hauck's (Hauck Marketing) media-buying workflow. The active client is ${client}.`,
  );
  lines.push("");
  lines.push(`Stay in character as ${opts.agent.name}. Be direct, precise, and concise. No fluff.`);
  lines.push("Address Jake as \"Sir\". Dry British wit is welcome where appropriate.");
  lines.push("**Never use em dashes (—) in any output.** Use commas, periods, parentheses, or colons instead. This applies to chat replies, ad copy, emails, headlines, summaries, code comments, and every other piece of text you produce. No exceptions.");

  appendVaultSections(lines, opts.aboutNotes, opts.clientNotes, client);

  lines.push("");
  lines.push("# Persona");
  lines.push("");
  lines.push(persona);

  const chunks = opts.knowledgeChunks ?? [];
  if (chunks.length > 0) {
    lines.push("");
    lines.push("# Reference knowledge");
    lines.push("");
    lines.push(
      "The following excerpts from Jake's knowledge base may be relevant. Use them only if they help; ignore otherwise.",
    );
    lines.push("");
    for (const c of chunks) {
      lines.push(`## ${c.id}: ${c.title}`);
      if (c.tags.length > 0) {
        lines.push(`tags: ${c.tags.join(", ")}`);
      }
      lines.push("");
      lines.push(c.body);
      lines.push("");
    }
  }

  if (opts.history.length > 0) {
    lines.push("");
    lines.push("# Conversation so far");
    lines.push("");
    for (const turn of opts.history) {
      if (turn.role === "user") {
        lines.push(`Jake: ${turn.body.trim()}`);
      } else {
        const speaker = turn.agent ?? opts.agent.name;
        lines.push(`${speaker}: ${turn.body.trim()}`);
      }
      lines.push("");
    }
  }

  lines.push("# New message from Jake");
  lines.push("");
  lines.push(opts.userInput.trim());
  lines.push("");
  lines.push(
    `Respond as ${opts.agent.name}. Keep your answer focused on what helps Jake make his next decision.`,
  );

  return lines.join("\n");
}

/** Markers Forge wraps a plan draft in, so the UI can lift it out of the chat
 *  reliably (the way save_diagnosis keys off a fenced JSON block). Kept as a
 *  non-backtick delimiter so plans can themselves contain fenced code. */
export const PLAN_OPEN = "<<<PLAN";
export const PLAN_CLOSE = "PLAN>>>";

export type PlanChatTurn = { role: "user" | "assistant"; body: string };

/**
 * Assemble the prompt for the Plans chat ("Forge"). Forge challenges the idea
 * before it drafts, decides whether the idea is an app-feature spec or a
 * business/agency play, and emits the plan wrapped between PLAN_OPEN/PLAN_CLOSE
 * markers so the UI can extract, preview, and save it.
 */
export function assemblePlanPrompt(opts: {
  history: PlanChatTurn[];
  userInput: string;
  aboutNotes?: VaultNote[];
  currentPlan?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(
    "You are Forge, the build-plan architect in Jake Hauck's (Hauck Marketing) workspace.",
  );
  lines.push(
    "Jake brings you a raw idea. Your job is to turn it into a detailed, executable build plan he can pick up and run later, possibly weeks from now and possibly handed to a separate engineer or to CLI Claude Code.",
  );
  lines.push("");
  lines.push("Address Jake as \"Sir\". Calm, precise, dry British wit. No fluff.");
  lines.push(
    "**Never use em dashes (—) anywhere.** Use commas, periods, parentheses, or colons instead. No exceptions.",
  );

  const about = opts.aboutNotes ?? [];
  if (about.length > 0) {
    lines.push("");
    lines.push("# About Jake and the agency");
    lines.push("");
    for (const note of about) {
      lines.push(note.body.trim());
      lines.push("");
    }
  }

  lines.push("");
  lines.push("# How you work");
  lines.push("");
  lines.push(
    "1. Challenge before you draft. Do not dump a detailed plan from a one-line idea, that just means you invented ninety percent of it. Ask the few sharp questions that actually change the plan: what problem this solves, who it is for, what 'done' looks like, and what is explicitly out of scope. Two to four questions, not an interrogation. If Jake says 'just draft it' or the idea is already specific, skip ahead and draft.",
  );
  lines.push(
    "2. Detect the kind of plan. If the idea is about building or changing software in this app, treat it as a FEATURE plan. If it is a marketing, offer, client, or operations idea, treat it as a BUSINESS plan. If genuinely unsure, ask which one in your first reply.",
  );
  lines.push(
    "3. Once you have enough, write the plan. Keep iterating it as Jake reacts.",
  );
  lines.push("");
  lines.push("# Plan output format");
  lines.push("");
  lines.push(
    `Whenever you produce or revise the plan, output the full current plan as GitHub-flavored markdown wrapped exactly between a line reading ${PLAN_OPEN} and a line reading ${PLAN_CLOSE}. Put any conversational reply (questions, commentary) OUTSIDE those markers, above the block. Always emit the COMPLETE plan inside the markers, not a diff, so the latest block always stands alone. Start the plan with a single '# Title' heading.`,
  );
  lines.push("");
  lines.push("FEATURE plans use these sections:");
  lines.push(
    "## Problem · ## Goal · ## Scope (in / out) · ## Surfaces & files likely touched · ## Approach (numbered steps) · ## Acceptance criteria · ## Risks & open questions · ## Effort estimate",
  );
  lines.push("");
  lines.push("BUSINESS plans use these sections:");
  lines.push(
    "## Hypothesis · ## Who it's for · ## The play (numbered steps) · ## Assets needed · ## Success metric · ## Timeline · ## Risks & open questions",
  );
  lines.push("");
  lines.push(
    "Do not emit a plan block until you actually have a plan worth saving. While you are still asking clarifying questions, reply in plain text with no markers.",
  );

  if (opts.currentPlan && opts.currentPlan.trim().length > 0) {
    lines.push("");
    lines.push("# Current saved draft of the plan");
    lines.push("");
    lines.push(
      "This is the plan as it stands. Treat it as the working draft and revise it in place rather than starting over.",
    );
    lines.push("");
    lines.push(opts.currentPlan.trim());
  }

  if (opts.history.length > 0) {
    lines.push("");
    lines.push("# Conversation so far");
    lines.push("");
    for (const turn of opts.history) {
      lines.push(`${turn.role === "user" ? "Jake" : "Forge"}: ${turn.body.trim()}`);
      lines.push("");
    }
  }

  lines.push("# New message from Jake");
  lines.push("");
  lines.push(opts.userInput.trim());
  lines.push("");
  lines.push(
    "Respond as Forge. Challenge where it helps, then refine the plan. Keep replies tight.",
  );

  return lines.join("\n");
}

export type DiagnosisPromptInputs = {
  spend: number | null;
  cpm: number | null;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  frequency: number | null;
  creatives_active: number | null;
};

/**
 * Build the prompt for a Zenith diagnosis run. Always asks Zenith to emit a
 * fenced JSON block first so save_diagnosis can populate frontmatter reliably.
 */
export function assembleDiagnosisPrompt(opts: {
  zenithBody: string;
  inputs: DiagnosisPromptInputs;
  paste: string;
  clientName?: string;
  knowledgeChunks?: KnowledgeChunk[];
  aboutNotes?: VaultNote[];
  clientNotes?: VaultNote[];
}): string {
  const persona = stripFrontmatter(opts.zenithBody).trim();
  const client = opts.clientName ?? "Willis Windows";

  const lines: string[] = [];
  lines.push(
    `You are Zenith, an AI agent in Jake Hauck's (Hauck Marketing) media-buying workflow. The active client is ${client}.`,
  );
  lines.push("");
  lines.push(`Stay in character as Zenith. Be direct, precise, and concise. No fluff.`);
  lines.push("Address Jake as \"Sir\". Dry British wit is welcome where appropriate.");
  lines.push("**Never use em dashes (—) in any output.** Use commas, periods, parentheses, or colons instead. This applies to chat replies, ad copy, emails, headlines, summaries, code comments, and every other piece of text you produce. No exceptions.");

  appendVaultSections(lines, opts.aboutNotes, opts.clientNotes, client);

  lines.push("");
  lines.push("# Persona");
  lines.push("");
  lines.push(persona);

  const chunks = opts.knowledgeChunks ?? [];
  if (chunks.length > 0) {
    lines.push("");
    lines.push("# Reference knowledge");
    lines.push("");
    lines.push(
      "The following excerpts from Jake's knowledge base may be relevant. Use them only if they help; ignore otherwise.",
    );
    lines.push("");
    for (const c of chunks) {
      lines.push(`## ${c.id}: ${c.title}`);
      if (c.tags.length > 0) {
        lines.push(`tags: ${c.tags.join(", ")}`);
      }
      lines.push("");
      lines.push(c.body);
      lines.push("");
    }
  }

  lines.push("");
  lines.push("## Snapshot");
  lines.push("");
  const metricRows: Array<[string, string]> = [];
  const { inputs } = opts;
  if (inputs.spend !== null) metricRows.push(["Spend", `$${inputs.spend}`]);
  if (inputs.cpm !== null) metricRows.push(["CPM", `$${inputs.cpm}`]);
  if (inputs.ctr !== null) metricRows.push(["CTR", `${inputs.ctr}%`]);
  if (inputs.cvr !== null) metricRows.push(["CVR", `${inputs.cvr}%`]);
  if (inputs.cpa !== null) metricRows.push(["CPA", `$${inputs.cpa}`]);
  if (inputs.roas !== null) metricRows.push(["ROAS", `${inputs.roas}x`]);
  if (inputs.frequency !== null) metricRows.push(["Frequency", `${inputs.frequency}`]);
  if (inputs.creatives_active !== null)
    metricRows.push(["Creatives Active", `${inputs.creatives_active}`]);

  if (metricRows.length === 0 && opts.paste.trim().length === 0) {
    lines.push("(no structured metrics provided)");
  } else {
    for (const [k, v] of metricRows) {
      lines.push(`${k}: ${v}`);
    }
    if (opts.paste.trim().length > 0) {
      lines.push("");
      lines.push("Raw paste from Jake:");
      lines.push("");
      lines.push(opts.paste.trim());
    }
  }

  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(
    "Diagnose this campaign. Identify the bottleneck. Surface 1-4 findings, attributed to the agent that owns the layer (VORTEX=creative, STRATOS=offer/landing, NEXUS=tracking, AURELIUS=strategy).",
  );
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push(
    "FIRST emit a fenced JSON block matching this exact shape (no extra keys), then write your free-form analysis below it:",
  );
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"verdict":"hold","scale_score":52,"headline":"…","body":"…","findings":[{"severity":"high","attribution":"VORTEX","body":"…"}]}',
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "verdict ∈ {kill, hold, scale}. scale_score is an integer 0-100 where 0=kill, 50=hold, 100=scale aggressively. severity ∈ {high, med, low}. attribution ∈ {VORTEX, STRATOS, NEXUS, AURELIUS}. headline is one sentence. body is 1-3 sentences.",
  );
  lines.push("");
  lines.push("After the JSON, write a full Zenith-style diagnosis transcript for Jake.");

  return lines.join("\n");
}
