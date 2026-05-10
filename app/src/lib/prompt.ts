import type { AgentSummary, ChatTurn } from "./types";

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

/**
 * Assemble the full prompt sent to `claude -p` for one turn.
 *
 * v1 strategy (from APP-FOUNDATION-PLAN.md § Conversation context strategy):
 *   1. Agent body markdown as persona
 *   2. Full conversation history (replayed each turn)
 *   3. New user input
 *
 * Keyword-routed knowledge chunks are deferred to v1.1 — noted in BUILD-NOTES.md.
 */
export function assemblePrompt(opts: {
  agent: AgentSummary;
  agentBody: string;
  history: ChatTurn[];
  userInput: string;
  clientName?: string;
}): string {
  const persona = stripFrontmatter(opts.agentBody).trim();
  const client = opts.clientName ?? "Willis Windows";

  const lines: string[] = [];
  lines.push(
    `You are ${opts.agent.name}, an AI agent in Jake Hauck's (Hauck Marketing) media-buying workflow. The active client is ${client}.`,
  );
  lines.push("");
  lines.push(`Stay in character as ${opts.agent.name}. Be direct, precise, and concise — no fluff.`);
  lines.push("Address Jake as \"Sir\". Dry British wit is welcome where appropriate.");
  lines.push("");
  lines.push("# Persona");
  lines.push("");
  lines.push(persona);

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
