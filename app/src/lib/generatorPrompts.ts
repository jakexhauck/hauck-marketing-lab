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

// ── Hook generator ────────────────────────────────────────
export type HookPromptInputs = {
  offer: string;
  audience: string;
  awareness: "cold" | "warm" | "retargeting";
  angleCount: number;
  hooksPerAngle: number;
  seed: string;
};

export function assembleHookPrompt(opts: {
  vortexBody: string;
  clientName: string;
  inputs: HookPromptInputs;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    "Vortex",
    opts.clientName,
    opts.vortexBody,
    opts.knowledgeChunks,
  );
  const total = Math.max(1, opts.inputs.angleCount * opts.inputs.hooksPerAngle);
  lines.push("");
  lines.push("## Brief");
  lines.push("");
  lines.push(`- Offer: ${opts.inputs.offer || "(unspecified)"}`);
  lines.push(`- Target audience: ${opts.inputs.audience || "(unspecified)"}`);
  lines.push(`- Awareness level: ${opts.inputs.awareness}`);
  lines.push(`- Angles: ${opts.inputs.angleCount}`);
  lines.push(`- Hooks per angle: ${opts.inputs.hooksPerAngle}`);
  lines.push(`- Total hooks: ${total}`);
  if (opts.inputs.seed.trim().length > 0) {
    lines.push("");
    lines.push("Seed / inspiration from Jake:");
    lines.push(opts.inputs.seed.trim());
  }
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(
    `Generate ${total} scroll-stopping hooks using the 100 Hook Framework. Cover ${opts.inputs.angleCount} distinct angles with ${opts.inputs.hooksPerAngle} hooks each. Diverse categories for algorithm variety.`,
  );
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push(
    "FIRST emit a fenced JSON block with this exact shape, then the human-readable hook list below it:",
  );
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"headline":"…","summary":"…","angles":[{"name":"…","category":"urgency|social_proof|problem|curiosity|transformation|tactical|disruption","hooks":["hook 1","hook 2"]}],"top_picks":[{"hook":"…","why":"…"}]}',
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "After the JSON, write a Vortex-style hook list grouped by angle with bold headers and 1-line rationale on top picks.",
  );
  return lines.join("\n");
}

// ── Creative brief ────────────────────────────────────────
export type CreativeBriefInputs = {
  product: string;
  format: string; // e.g. "1080x1080 static", "1080x1920 video 15-30s"
  quantity: string;
  audience: string;
  pains: string;
  desires: string;
  awareness: "cold" | "warm" | "hot";
  hook: string;
  coreMessage: string;
  proof: string;
  cta: string;
  visualStyle: string;
  doNots: string;
  deadline: string;
};

export function assembleCreativeBriefPrompt(opts: {
  vortexBody: string;
  clientName: string;
  inputs: CreativeBriefInputs;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    "Vortex",
    opts.clientName,
    opts.vortexBody,
    opts.knowledgeChunks,
  );
  const i = opts.inputs;
  lines.push("");
  lines.push("## Brief inputs");
  lines.push("");
  lines.push(`- Product/offer: ${i.product || "(unspecified)"}`);
  lines.push(`- Format(s): ${i.format || "(unspecified)"}`);
  lines.push(`- Quantity: ${i.quantity || "(unspecified)"}`);
  lines.push(`- Audience: ${i.audience || "(unspecified)"}`);
  lines.push(`- Awareness: ${i.awareness}`);
  if (i.pains.trim()) lines.push(`- Pain points: ${i.pains}`);
  if (i.desires.trim()) lines.push(`- Desires: ${i.desires}`);
  if (i.hook.trim()) lines.push(`- Lead hook: ${i.hook}`);
  if (i.coreMessage.trim()) lines.push(`- Core message: ${i.coreMessage}`);
  if (i.proof.trim()) lines.push(`- Proof elements: ${i.proof}`);
  if (i.cta.trim()) lines.push(`- CTA: ${i.cta}`);
  if (i.visualStyle.trim()) lines.push(`- Visual style: ${i.visualStyle}`);
  if (i.doNots.trim()) lines.push(`- Do-nots: ${i.doNots}`);
  if (i.deadline.trim()) lines.push(`- Deadline: ${i.deadline}`);
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(
    "Produce a complete creative brief a designer/editor can execute against. Follow the Vortex Creative Brief skill template — overview, audience, message, visual direction, technical specs, deliverables checklist. Be specific. No placeholders left unfilled.",
  );
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push("FIRST a fenced JSON block, then the full brief in markdown:");
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"headline":"…","summary":"…","format":"…","deliverables":["…","…"],"hook":"…","cta":"…"}',
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "After the JSON, write the brief as full markdown — headers, lists, tables where it helps. Production-ready.",
  );
  return lines.join("\n");
}

// ── Performance report ────────────────────────────────────
export type PerformanceReportInputs = {
  periodStart: string;
  periodEnd: string;
  spend: string;
  revenue: string;
  roas: string;
  cpa: string;
  conversions: string;
  goalRoas: string;
  goalCpa: string;
  campaignNotes: string;
  paste: string;
};

export function assemblePerformanceReportPrompt(opts: {
  aureliusBody: string;
  clientName: string;
  inputs: PerformanceReportInputs;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    "Aurelius",
    opts.clientName,
    opts.aureliusBody,
    opts.knowledgeChunks,
  );
  const i = opts.inputs;
  lines.push("");
  lines.push("## Reporting window");
  lines.push("");
  lines.push(`- Period: ${i.periodStart || "(start?)"} → ${i.periodEnd || "(end?)"}`);
  lines.push("");
  lines.push("## KPI snapshot");
  lines.push("");
  if (i.spend.trim()) lines.push(`- Spend: $${i.spend}`);
  if (i.revenue.trim()) lines.push(`- Revenue: $${i.revenue}`);
  if (i.roas.trim()) lines.push(`- ROAS: ${i.roas}x`);
  if (i.cpa.trim()) lines.push(`- CPA: $${i.cpa}`);
  if (i.conversions.trim()) lines.push(`- Conversions: ${i.conversions}`);
  if (i.goalRoas.trim()) lines.push(`- ROAS goal: ${i.goalRoas}x`);
  if (i.goalCpa.trim()) lines.push(`- CPA goal: $${i.goalCpa}`);
  if (i.campaignNotes.trim()) {
    lines.push("");
    lines.push("Notes from Jake:");
    lines.push(i.campaignNotes.trim());
  }
  if (i.paste.trim()) {
    lines.push("");
    lines.push("Raw paste / export:");
    lines.push("");
    lines.push(i.paste.trim());
  }
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(
    "Produce a client-ready performance report. Lead with the headline. Walk through KPIs vs goals, period-over-period implications, what worked, what didn't, and a forward plan. Be honest about misses; assertive about wins.",
  );
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push("FIRST a fenced JSON block, then the report in markdown:");
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"headline":"…","summary":"…","verdict":"on_track|at_risk|off_track","top_wins":["…"],"top_losses":["…"],"next_steps":["…"]}',
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "After the JSON, write the report as full markdown — KPI table, by-campaign breakdown if data permits, insights, next-period plan.",
  );
  return lines.join("\n");
}

// ── Scale-readiness ───────────────────────────────────────
export type ScaleReadinessInputs = {
  dailySpend: string;
  roas: string;
  targetRoas: string;
  cpa: string;
  targetCpa: string;
  daysStable: string;
  activeCreatives: string;
  topCreativePct: string;
  frequency: string;
  capiStatus: "ok" | "warning" | "missing";
  emqScore: string;
  infraReady: "yes" | "partial" | "no";
  notes: string;
};

export function assembleScaleReadinessPrompt(opts: {
  stratosBody: string;
  clientName: string;
  inputs: ScaleReadinessInputs;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const lines = header(
    "Stratos",
    opts.clientName,
    opts.stratosBody,
    opts.knowledgeChunks,
  );
  const i = opts.inputs;
  lines.push("");
  lines.push("## Snapshot");
  lines.push("");
  if (i.dailySpend.trim()) lines.push(`- Daily spend: $${i.dailySpend}`);
  if (i.roas.trim()) lines.push(`- ROAS: ${i.roas}x (target ${i.targetRoas || "?"}x)`);
  if (i.cpa.trim()) lines.push(`- CPA: $${i.cpa} (target $${i.targetCpa || "?"})`);
  if (i.daysStable.trim()) lines.push(`- Days stable: ${i.daysStable}`);
  if (i.activeCreatives.trim()) lines.push(`- Active creatives: ${i.activeCreatives}`);
  if (i.topCreativePct.trim()) lines.push(`- Top creative % of spend: ${i.topCreativePct}%`);
  if (i.frequency.trim()) lines.push(`- Frequency: ${i.frequency}`);
  lines.push(`- CAPI: ${i.capiStatus}`);
  if (i.emqScore.trim()) lines.push(`- EMQ: ${i.emqScore}/10`);
  lines.push(`- Infrastructure (sales/support/cash flow): ${i.infraReady}`);
  if (i.notes.trim()) {
    lines.push("");
    lines.push("Notes from Jake:");
    lines.push(i.notes.trim());
  }
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(
    "Apply the 4-Pillar Scale Readiness check (metrics / creative / tracking / infrastructure). Score each pillar. Verdict: GREEN (scale by 20%), YELLOW (fix issues first), or RED (do not scale). If GREEN, propose a scaling schedule. If not, name the blockers and the order to fix them.",
  );
  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push("FIRST a fenced JSON block, then the full readiness report:");
  lines.push("");
  lines.push("```json");
  lines.push(
    '{"verdict":"green|yellow|red","headline":"…","summary":"…","pillars":{"metrics":{"score":4,"max":5,"status":"green|yellow|red","notes":"…"},"creative":{"score":3,"max":5,"status":"…","notes":"…"},"tracking":{"score":3,"max":4,"status":"…","notes":"…"},"infrastructure":{"score":4,"max":4,"status":"…","notes":"…"}},"blockers":["…"],"next_actions":["…"]}',
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "After the JSON, write the full Stratos-style readiness report including the scaling schedule if GREEN.",
  );
  return lines.join("\n");
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
