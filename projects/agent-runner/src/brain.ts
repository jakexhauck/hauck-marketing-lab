// The brain notes on disk: vault/Clients/<Folder>/Brain.md and
// vault/Agents/<Agent>/Brain.md.
//
// One lesson is one line, in a shape Obsidian already understands:
//
//   - [2026-10-17] (ads, Willis Windows, chat 1a2b) Before/after beats quotes ^l-3fa9c021
//
// The trailing ^l-xxxxxxxx is an Obsidian block id. It is the lesson's identity
// everywhere: in the app's mirror, in an edit queued from the Brain tab, in a
// citation in a reply. Edits match on it and nothing else, never on a line
// number or on the text, because the file moves under a queued edit: the runner
// appends while Jake is deciding what to delete, and Jake edits in Obsidian
// whenever he likes.
//
// The runner is the only writer from the app's side. The page queues an edit;
// the runner applies it here and reports it applied.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripEmDashes } from "./output.ts";
import type { AgentId, AgentLesson, LessonEdit, LessonScope } from "./wire.ts";

export const LESSON_LINE = /^- \[(\d{4}-\d{2}-\d{2})\] \(([a-z]+), (.*?)\) (.*) \^(l-[0-9a-f]{8})\s*$/;

export interface BrainContext {
  scope: LessonScope;
  tenantId: string | null;
}

export function newLessonId(): string {
  return `l-${randomBytes(4).toString("hex")}`;
}

// A lesson must stay one line and must not carry something that looks like a
// block id of its own, or the next read would split or mis-key it.
function cleanText(s: string): string {
  return stripEmDashes(s)
    .replace(/\^l-[0-9a-f]{8}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The source sits inside the parentheses, so it cannot hold one.
function cleanSource(s: string): string {
  return s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

function read(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

export function brainTemplate(title: string, frontmatter: Record<string, string>): string {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${fm}\n---\n\n# ${title}\n\n## Lessons\n`;
}

export function readLessons(file: string, ctx: BrainContext = { scope: "client", tenantId: null }): AgentLesson[] {
  const out: AgentLesson[] = [];
  for (const line of read(file).split(/\r?\n/)) {
    const m = LESSON_LINE.exec(line);
    if (!m) continue;
    out.push({
      id: m[5],
      scope: ctx.scope,
      tenantId: ctx.tenantId,
      agent: m[2] as AgentId,
      text: m[4],
      source: m[3],
      learnedOn: m[1],
    });
  }
  return out;
}

export function appendLessons(
  file: string,
  agent: AgentId,
  source: string,
  lines: string[],
  today: string,
  ctx: BrainContext = { scope: "client", tenantId: null },
): AgentLesson[] {
  const added: AgentLesson[] = [];
  const src = cleanSource(source);
  const rows: string[] = [];
  for (const raw of lines) {
    const text = cleanText(raw);
    if (!text) continue;
    const id = newLessonId();
    rows.push(`- [${today}] (${agent}, ${src}) ${text} ^${id}`);
    added.push({ id, scope: ctx.scope, tenantId: ctx.tenantId, agent, text, source: src, learnedOn: today });
  }
  if (rows.length === 0) return added;

  let body = read(file);
  if (!body) {
    mkdirSync(dirname(file), { recursive: true });
    body = brainTemplate("Brain", { type: "brain" });
  }
  if (!body.endsWith("\n")) body += "\n";
  writeFileSync(file, body + rows.join("\n") + "\n");
  return added;
}

// Returns the ids of the EDITS applied in this file (not the lesson ids): that
// is what the app is waiting to hear back. An edit whose lesson is not in this
// file is left for the caller, which tries the other brain files.
export function applyEdits(file: string, edits: LessonEdit[]): string[] {
  const body = read(file);
  if (!body || edits.length === 0) return [];
  const applied: string[] = [];
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  let lines = body.split(/\r?\n/);
  for (const edit of edits) {
    const at = lines.findIndex((l) => {
      const m = LESSON_LINE.exec(l);
      return !!m && m[5] === edit.lessonId;
    });
    if (at < 0) continue;
    if (edit.action === "delete") {
      lines = lines.filter((_, i) => i !== at);
    } else {
      const m = LESSON_LINE.exec(lines[at])!;
      const text = cleanText(edit.text ?? "");
      if (!text) continue;
      lines[at] = `- [${m[1]}] (${m[2]}, ${m[3]}) ${text} ^${m[5]}`;
    }
    applied.push(edit.id);
  }
  if (applied.length) writeFileSync(file, lines.join(eol));
  return applied;
}
