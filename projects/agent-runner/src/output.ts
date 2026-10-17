// Reading what an agent wrote back.
//
// The agent answers in plain prose and may end with fenced blocks the runner
// acts on (the protocol is spelled out to it in agents/_protocol.md):
//
//   ```lessons   one lesson per line; "agent: " in front means craft knowledge
//                for the agent's own brain rather than this client's
//   ```item      JSON ItemDraft (or an array): a card for the Building panel
//   ```request   JSON RequestDraft: an ask for another agent
//
// Everything here is forgiving on purpose. A model that writes a broken JSON
// block has still answered Jake, so a bad block is dropped and the reply kept.
// Losing the reply over a stray comma would be the worse failure.

import { isAgentId } from "./agents.ts";
import { UUID } from "./paths.ts";
import type { AgentId, ItemStatus } from "./wire.ts";

export interface ItemDraft {
  id?: string;
  kind: string;
  title: string;
  status?: ItemStatus;
  payload?: Record<string, unknown>;
}

export interface RequestDraft {
  toAgent: AgentId;
  title: string;
  body: string;
  plan: string[];
}

export interface AgentOutput {
  reply: string;
  lessons: string[];
  items: ItemDraft[];
  requests: RequestDraft[];
}

// The house rule is no em dashes anywhere. The agents are told; this is the
// backstop for when they forget, which they do. A dash used as a pause reads
// fine as a comma, so that is what it becomes.
export function stripEmDashes(s: string): string {
  return s.replace(/\s*\u2014\s*/g, ", ");
}

const BLOCK = /```(lessons|item|request)[^\n]*\n([\s\S]*?)```/g;

function parseJson(body: string): unknown[] {
  try {
    const v = JSON.parse(body);
    return Array.isArray(v) ? v : [v];
  } catch {
    return [];
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function toItem(v: unknown): ItemDraft | null {
  if (!isObj(v) || typeof v.kind !== "string" || typeof v.title !== "string") return null;
  const out: ItemDraft = { kind: v.kind, title: v.title };
  // A card id from the model is only ever a uuid. It names a folder later
  // (landing.ts), so a "../" here would be a path, not a card.
  if (typeof v.id === "string" && UUID.test(v.id)) out.id = v.id;
  if (typeof v.status === "string") out.status = v.status as ItemStatus;
  if (isObj(v.payload)) out.payload = v.payload;
  return out;
}

function toRequest(v: unknown): RequestDraft | null {
  if (!isObj(v) || !isAgentId(v.toAgent) || typeof v.title !== "string" || typeof v.body !== "string") return null;
  const plan = Array.isArray(v.plan) ? v.plan.filter((p): p is string => typeof p === "string") : [];
  return { toAgent: v.toAgent, title: v.title, body: v.body, plan };
}

export function parseAgentOutput(text: string): AgentOutput {
  const out: AgentOutput = { reply: "", lessons: [], items: [], requests: [] };
  for (const [, kind, body] of text.matchAll(BLOCK)) {
    if (kind === "lessons") {
      for (const raw of body.split("\n")) {
        const line = stripEmDashes(raw.replace(/^\s*[-*]\s+/, "").trim());
        if (line) out.lessons.push(line);
      }
    } else if (kind === "item") {
      for (const v of parseJson(body)) {
        const item = toItem(v);
        if (item) out.items.push(item);
      }
    } else {
      for (const v of parseJson(body)) {
        const req = toRequest(v);
        if (req) out.requests.push(req);
      }
    }
  }
  out.reply = stripEmDashes(text.replace(BLOCK, "")).trim();
  return out;
}

// The agent cites a brain lesson it relied on as [l-3fa9c021]. The ids become
// the "used from brain" chips; the brackets are noise in the reply itself.
const CITE = /\s*\[(l-[0-9a-f]{8})\]/g;

export function extractCitations(reply: string): { reply: string; ids: string[] } {
  const ids = [...reply.matchAll(CITE)].map((m) => m[1]);
  return { reply: reply.replace(CITE, ""), ids: [...new Set(ids)] };
}
