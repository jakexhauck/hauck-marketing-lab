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
//
// Memory, not just a list (docs/build-plans/hermes-agent-ops.md, Phase 4). A
// lesson may open with its kind, "[decision]" or "[fact]" (a plain line is a
// lesson). An edit from the app does not overwrite: the old line is kept and
// marked "(replaced by l-xxxxxxxx)", and the new wording is a new line whose
// source is Jake. So the brain keeps what was believed before and when it
// changed, and a wrong correction can be walked back.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripEmDashes } from "./output.ts";
import type { AgentId, AgentLesson, LessonEdit, LessonScope } from "./wire.ts";

export const LESSON_LINE = /^- \[(\d{4}-\d{2}-\d{2})\] \(([a-z]+), (.*?)\) (.*) \^(l-[0-9a-f]{8})\s*$/;
const KIND_TAG = /^\[(decision|fact|lesson)\]\s*/i;
const REPLACED_TAG = /\s*\(replaced by (l-[0-9a-f]{8})\)\s*$/;

export type LessonKind = "lesson" | "decision" | "fact";

// The kind and the replacement read off a lesson's text. The text handed on
// keeps neither tag, so the app shows the words and labels them itself.
export function lessonParts(raw: string): { kind: LessonKind; replacedBy: string | null; text: string } {
  const replaced = REPLACED_TAG.exec(raw);
  let text = replaced ? raw.slice(0, replaced.index) : raw;
  const kind = KIND_TAG.exec(text);
  if (kind) text = text.slice(kind[0].length);
  return { kind: ((kind?.[1].toLowerCase() as LessonKind) ?? "lesson"), replacedBy: replaced?.[1] ?? null, text: text.trim() };
}

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
    const parts = lessonParts(m[4]);
    out.push({
      id: m[5],
      scope: ctx.scope,
      tenantId: ctx.tenantId,
      agent: m[2] as AgentId,
      text: parts.text,
      source: m[3],
      learnedOn: m[1],
      kind: parts.kind,
      replacedBy: parts.replacedBy,
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
    const parts = lessonParts(text);
    added.push({ id, scope: ctx.scope, tenantId: ctx.tenantId, agent, text: parts.text, source: src, learnedOn: today, kind: parts.kind, replacedBy: null });
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
//
// A delete removes the line (a test fact, junk). An edit replaces: the old line
// is marked and kept, the new wording goes in right under it as Jake's, with
// the old line's kind unless the new text names its own.
export function applyEdits(file: string, edits: LessonEdit[], today: string = new Date().toISOString().slice(0, 10)): string[] {
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
      const old = lessonParts(m[4]);
      const text = cleanText(edit.text ?? "");
      if (!text) continue;
      // Editing a line already replaced edits the history, which is not what a
      // correction is: the app only offers edit on current lessons, so skip.
      if (old.replacedBy) continue;
      const id = newLessonId();
      const tagged = KIND_TAG.test(text) || old.kind === "lesson" ? text : `[${old.kind}] ${text}`;
      lines[at] = `- [${m[1]}] (${m[2]}, ${m[3]}) ${m[4]} (replaced by ${id}) ^${m[5]}`;
      lines.splice(at + 1, 0, `- [${today}] (${m[2]}, Jake) ${tagged} ^${id}`);
    }
    applied.push(edit.id);
  }
  if (applied.length) writeFileSync(file, lines.join(eol));
  return applied;
}
