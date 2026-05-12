import type { KnowledgeChunk } from "./types";

function stripFrontmatter(md: string): string {
  const trimmed = md.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return trimmed;
  const after = trimmed.slice(3).replace(/^\n/, "");
  const end = after.indexOf("\n---");
  if (end === -1) return trimmed;
  return after.slice(end + 4).replace(/^\n/, "");
}

function header(
  agentName: string,
  clientName: string,
  agentBody: string,
  knowledgeChunks: KnowledgeChunk[] | undefined,
): string[] {
  const persona = stripFrontmatter(agentBody).trim();
  const lines: string[] = [];
  lines.push(
    `You are ${agentName}, an AI agent in Jake Hauck's (Hauck Marketing) media-buying workflow. The active client is ${clientName}.`,
  );
  lines.push("");
  lines.push(
    `Stay in character as ${agentName}. Be direct, precise, and concise — no fluff.`,
  );
  lines.push('Address Jake as "Sir". Dry British wit is welcome where appropriate.');
  lines.push("");
  lines.push("# Persona");
  lines.push("");
  lines.push(persona);

  const chunks = knowledgeChunks ?? [];
  if (chunks.length > 0) {
    lines.push("");
    lines.push("# Reference knowledge");
    lines.push("");
    lines.push(
      "The following excerpts from Jake's knowledge base may help. Use only if relevant.",
    );
    lines.push("");
    for (const c of chunks) {
      lines.push(`## ${c.id} — ${c.title}`);
      if (c.tags.length > 0) lines.push(`tags: ${c.tags.join(", ")}`);
      lines.push("");
      lines.push(c.body);
      lines.push("");
    }
  }
  return lines;
}

// ── Tracking audit walk-through ───────────────────────────
export type TrackingAuditWalkInputs = {
  pixelId: string;
  pixelInstalled: "all" | "some" | "none";
  capiConfigured: "yes" | "partial" | "no";
  capiAccessToken: "valid" | "expired" | "missing";
  dedup: "verified" | "unknown" | "broken";
  emqScore: string;
  events: {
    pageView: boolean;
    viewContent: boolean;
    lead: boolean;
    purchase: boolean;
  };
  userDataParams: string[]; // e.g. ["fbp","fbc","em","ph"]
  notes: string;
};

export function assembleTrackingAuditPrompt(opts: {
  nexusBody: string;
  clientName: string;
  inputs: TrackingAuditWalkInputs;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    "Nexus",
    opts.clientName,
    opts.nexusBody,
    opts.knowledgeChunks,
  );
  const i = opts.inputs;
  lines.push("");
  lines.push("## Setup snapshot");
  lines.push("");
  lines.push(`- Pixel ID: ${i.pixelId || "(missing)"}`);
  lines.push(`- Pixel installed on: ${i.pixelInstalled}`);
  lines.push(`- CAPI configured: ${i.capiConfigured}`);
  lines.push(`- CAPI access token: ${i.capiAccessToken}`);
  lines.push(`- Dedup (event_id parity): ${i.dedup}`);
  lines.push(`- EMQ: ${i.emqScore || "?"}/10`);
  lines.push(
    `- Events firing — PageView: ${i.events.pageView}, ViewContent: ${i.events.viewContent}, Lead: ${i.events.lead}, Purchase: ${i.events.purchase}`,
  );
  lines.push(
    `- User-data parameters present: ${i.userDataParams.length > 0 ? i.userDataParams.join(", ") : "(none)"}`,
  );
  if (i.notes.trim()) {
    lines.push("");
    lines.push("Notes from Jake:");
    lines.push(i.notes.trim());
  }
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(
    "Audit this tracking setup using the Nexus Tracking Audit skill. For EACH check (pixel, events, CAPI, dedup, EMQ), state status (OK / WARNING / MISSING) and — if not OK — provide a copy-paste fix snippet (code / settings path / exact action). End with a launch-ready verdict.",
  );
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push("FIRST a fenced JSON block, then the audit body:");
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"launch_ready":"yes|no|conditional","headline":"…","summary":"…","checks":[{"id":"pixel","label":"Pixel fires on all pages","status":"ok|warning|missing","fix":"… or empty"},{"id":"capi","label":"CAPI configured","status":"…","fix":"…"},{"id":"dedup","label":"event_id parity","status":"…","fix":"…"},{"id":"emq","label":"EMQ >= 7","status":"…","fix":"…"},{"id":"events","label":"Required events firing","status":"…","fix":"…"}]}',
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "After the JSON, write the full Nexus audit with each check expanded — copy-paste fix snippets included.",
  );
  return lines.join("\n");
}

// ── Workflow chain (orchestrator step prompts) ────────────
export type WorkflowKind = "launch" | "optimize" | "scale";

export type WorkflowStepContext = {
  workflowKind: WorkflowKind;
  clientName: string;
  brief: string; // free-form user input describing situation
  priorSteps: Array<{ agent: string; body: string }>;
};

export function assembleWorkflowStepPrompt(opts: {
  agentName: string;
  agentBody: string;
  stepGoal: string;
  ctx: WorkflowStepContext;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    opts.agentName,
    opts.ctx.clientName,
    opts.agentBody,
    opts.knowledgeChunks,
  );
  lines.push("");
  lines.push(`## Workflow: ${opts.ctx.workflowKind.toUpperCase()}`);
  lines.push("");
  lines.push(`Step goal for ${opts.agentName}: ${opts.stepGoal}`);
  if (opts.ctx.brief.trim()) {
    lines.push("");
    lines.push("## Situation brief");
    lines.push("");
    lines.push(opts.ctx.brief.trim());
  }
  if (opts.ctx.priorSteps.length > 0) {
    lines.push("");
    lines.push("## Prior steps in this workflow");
    lines.push("");
    for (const s of opts.ctx.priorSteps) {
      lines.push(`### ${s.agent}`);
      lines.push("");
      lines.push(s.body.trim());
      lines.push("");
    }
  }
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(
    `Respond as ${opts.agentName}. Keep it scannable: 1-line headline, 3-6 bullets, 1-line handoff to the next agent. No fluff.`,
  );
  return lines.join("\n");
}

export function assembleWorkflowFinalPrompt(opts: {
  aureliusBody: string;
  ctx: WorkflowStepContext;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    "Aurelius",
    opts.ctx.clientName,
    opts.aureliusBody,
    opts.knowledgeChunks,
  );
  lines.push("");
  lines.push(`## Workflow finale: ${opts.ctx.workflowKind.toUpperCase()}`);
  lines.push("");
  lines.push(
    "You have the full briefing from each specialist. Synthesize. Issue a final GO / HOLD / NO-GO verdict with the top 3 next moves, in order. This is the artifact Jake will act on tomorrow.",
  );
  if (opts.ctx.brief.trim()) {
    lines.push("");
    lines.push("## Situation brief");
    lines.push("");
    lines.push(opts.ctx.brief.trim());
  }
  if (opts.ctx.priorSteps.length > 0) {
    lines.push("");
    lines.push("## Specialist briefings");
    lines.push("");
    for (const s of opts.ctx.priorSteps) {
      lines.push(`### ${s.agent}`);
      lines.push("");
      lines.push(s.body.trim());
      lines.push("");
    }
  }
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push("FIRST a fenced JSON block, then the final memo:");
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"verdict":"go|hold|no_go","headline":"…","summary":"…","next_moves":["…","…","…"]}',
  );
  lines.push("```");
  lines.push("");
  lines.push("After the JSON, write the final Aurelius memo Jake can act on.");
  return lines.join("\n");
}
