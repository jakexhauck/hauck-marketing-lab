import type { KnowledgeChunk } from "./types";
import type { FormConfig, FormField, FormValues } from "./formConfigs";

function stripFrontmatter(md: string): string {
  const trimmed = md.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return trimmed;
  const after = trimmed.slice(3).replace(/^\n/, "");
  const end = after.indexOf("\n---");
  if (end === -1) return trimmed;
  return after.slice(end + 4).replace(/^\n/, "");
}

function fieldValueForPrompt(field: FormField, value: unknown): string {
  if (value === undefined || value === null) return "(unspecified)";
  if (field.kind === "multi") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return arr.length > 0 ? arr.join(", ") : "(none)";
  }
  const s = String(value).trim();
  return s.length > 0 ? s : "(unspecified)";
}

/** Template-mode value renderer: empty values collapse to empty string so the
 *  surrounding template literals (e.g. "$[SPEND LAST]") stay clean even when
 *  the field is unfilled. Diverges from `fieldValueForPrompt`, which uses
 *  "(unspecified)" for the scaffolded prompt mode. */
function templateValueForPrompt(field: FormField, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (field.kind === "multi") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return arr.join(", ");
  }
  return String(value).trim();
}

/** Render a verbatim prompt template, substituting each field's
 *  `promptPlaceholder` with its current value. The template is shipped as-is
 *  with no surrounding persona/brief/output scaffolding — use this for prompts
 *  you've authored end-to-end. Unmatched placeholders are left untouched.
 *
 *  Built-in placeholders (no form field needed):
 *  - [CLIENT NAME] / [CLIENT_NAME] — the active client's name.
 *  - [BUSINESS NAME] / [BUSINESS_NAME] — alias for the active client's name. */
function renderPromptTemplate(
  template: string,
  config: FormConfig,
  values: FormValues,
  clientName: string,
): string {
  let out = template;
  for (const section of config.sections) {
    for (const f of section.fields) {
      const token = f.promptPlaceholder;
      if (!token) continue;
      const value = templateValueForPrompt(f, values[f.key]);
      out = out.split(token).join(value);
    }
  }
  for (const alias of ["[CLIENT NAME]", "[CLIENT_NAME]", "[BUSINESS NAME]", "[BUSINESS_NAME]"]) {
    out = out.split(alias).join(clientName);
  }
  return out;
}

export function assembleGenericPrompt(opts: {
  config: FormConfig;
  values: FormValues;
  agentBody: string;
  clientName: string;
  driveContext: string | null;
  knowledgeChunks?: KnowledgeChunk[];
}): string {
  const { config, values, agentBody, clientName, driveContext, knowledgeChunks } = opts;

  // Template mode: ship the authored prompt verbatim with placeholder
  // substitution. No persona / brief / output scaffolding is added — the
  // template is treated as the complete prompt.
  if (config.promptTemplate) {
    return renderPromptTemplate(config.promptTemplate, config, values, clientName);
  }

  const lines: string[] = [];

  lines.push(
    `You are ${config.agentName}, an AI agent in Jake Hauck's (Hauck Marketing) media-buying workflow. The active client is ${clientName}.`,
  );
  lines.push("");
  lines.push(
    `Stay in character as ${config.agentName}. Be direct, precise, and concise — no fluff.`,
  );
  lines.push('Address Jake as "Sir". Dry British wit is welcome where appropriate.');
  lines.push("");
  lines.push("# Persona");
  lines.push("");
  lines.push(stripFrontmatter(agentBody).trim());

  if (driveContext && driveContext.trim().length > 0) {
    lines.push("");
    lines.push("# Client context (from their Google Drive folder)");
    lines.push("");
    lines.push(driveContext.trim());
  }

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

  lines.push("");
  lines.push("## Brief");
  lines.push("");
  for (const section of config.sections) {
    for (const f of section.fields) {
      const v = fieldValueForPrompt(f, values[f.key]);
      if (f.kind === "textarea" && v !== "(unspecified)") {
        lines.push(`- ${f.promptLabel ?? f.label}:`);
        for (const line of v.split("\n")) lines.push(`    ${line}`);
      } else {
        lines.push(`- ${f.promptLabel ?? f.label}: ${v}`);
      }
    }
  }

  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push((config.taskDescription ?? "").trim());

  lines.push("");
  lines.push("## Required output format");
  lines.push("");
  lines.push(
    "FIRST emit a fenced JSON block with this exact shape, then the full output in markdown:",
  );
  lines.push("");
  lines.push("```json");
  lines.push((config.outputSchema ?? "").trim());
  lines.push("```");
  lines.push("");
  lines.push((config.outputInstructions ?? "").trim());

  return lines.join("\n");
}

export function buildInputsYaml(config: FormConfig, values: FormValues): string {
  const out: string[] = [];
  for (const section of config.sections) {
    for (const f of section.fields) {
      const v = values[f.key];
      if (v === undefined || v === null) continue;
      if (f.kind === "multi") {
        const arr = Array.isArray(v) ? (v as string[]) : [];
        if (arr.length === 0) continue;
        out.push(`${f.key}:`);
        for (const item of arr) out.push(`  - "${item.replace(/"/g, '\\"')}"`);
        continue;
      }
      const s = String(v);
      if (s.trim().length === 0) continue;
      if (s.includes("\n")) {
        out.push(`${f.key}: |`);
        for (const line of s.split("\n")) out.push(`  ${line}`);
      } else if (f.kind === "number") {
        out.push(`${f.key}: ${s}`);
      } else {
        out.push(`${f.key}: "${s.replace(/"/g, '\\"')}"`);
      }
    }
  }
  return out.join("\n");
}
