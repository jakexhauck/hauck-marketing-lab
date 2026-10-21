// A client's setup tasks (Jake, 2026-10-20; docs/build-plans/client-fulfillment-and-director.md).
//
// The Client Fulfillment map is the process; these are the work, per client.
// Every step of a main-line box on that map seeds one task, owned by the name
// in its prefix ("GHL: ...") or else by its box. The key is stable
// (<box>:<name slug>) so the Manager's kickoff card can name a task to change
// or cut, and the old Brief tick it replaces is kept as sopKey so a client's
// existing ticks carry over. Pure.

import { AGENTS, type AgentId } from "./agents";
import { getAgentSop, type SopNode } from "./agentSops";
import { mainLine } from "./sopPrompt";
import { SOP_LISTS, sopTaskKey } from "./sopChecklists";

// The agency Manager owns no client task; the CSM does that work.
export type TaskOwner = "client" | "jake" | Exclude<AgentId, "manager">;
export type TaskState = "todo" | "doing" | "done" | "cut";
// Needs your OK (every write on a card) or Acts live (Jake, 2026-10-20;
// docs/build-plans/four-agents-and-handoffs.md). Every task starts on ask.
export type TaskMode = "ask" | "live";
export const TASK_MODES: TaskMode[] = ["ask", "live"];
export const MAX_WAITS = 20;

export interface SeedTask {
  key: string;
  phase: string;
  owner: TaskOwner;
  name: string;
  position: number;
  sourceNode: string;
  sopKey: string | null;
}

export interface ClientTask extends Omit<SeedTask, "sourceNode"> {
  id: string;
  sourceNode: string | null;
  steps: string[];
  state: TaskState;
  change: "kept" | "changed" | "added";
  reason: string | null;
  evidence: string | null;
  note: string | null;
  doneBy: string | null;
  doneAt: string | null;
  // Keys of the tasks this one waits on; empty = it starts when Jake names it.
  waitsOn: string[];
  mode: TaskMode;
  // Named values the task produced (a dataset id), handed to what waits on it.
  outputs: Record<string, string>;
}

// Row order on the Director.
export const TASK_OWNERS: TaskOwner[] = ["client", "jake", "csm", "research", "ghl", "ads"];

const PREFIX: Record<string, TaskOwner> = {
  "customer success": "csm",
  manager: "csm",
  ghl: "ghl",
  jake: "jake",
  client: "client",
  ads: "ads",
  creative: "ads",
  "landing page": "ads",
  reporting: "csm",
  "market research": "research",
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function fulfillmentLine(): SopNode[] {
  const map = getAgentSop("fulfillment");
  return map ? mainLine(map) : [];
}

export function taskPhases(): { id: string; name: string }[] {
  return fulfillmentLine().map((n) => ({ id: n.id, name: n.t }));
}

function boxOwner(n: SopNode): TaskOwner {
  if (n.k === "client") return "client";
  if (n.k === "jake") return "jake";
  return "csm";
}

function splitStep(n: SopNode, step: string): { owner: TaskOwner; name: string } {
  const m = /^([A-Za-z ]+):\s+(.+)$/.exec(step);
  const owner = m ? PREFIX[m[1].toLowerCase()] : undefined;
  return owner ? { owner, name: m![2].trim() } : { owner: boxOwner(n), name: step.trim() };
}

// Every SOP item as [key, normalised label], longest label first so a step
// containing two labels takes the more specific one.
const SOP_ITEMS: [string, string][] = Object.values(SOP_LISTS)
  .flatMap((list) =>
    list.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => [sopTaskKey(list.id, s.title, i.label), norm(i.label)] as [string, string]))),
  )
  .sort((a, b) => b[1].length - a[1].length);

function sopKeyFor(name: string): string | null {
  const n = norm(name);
  return SOP_ITEMS.find(([, label]) => n.includes(label))?.[0] ?? null;
}

export function seedTasks(): SeedTask[] {
  const out: SeedTask[] = [];
  for (const box of fulfillmentLine()) {
    (box.steps ?? []).forEach((step, i) => {
      const { owner, name } = splitStep(box, step);
      out.push({ key: `${box.id}:${slug(name)}`, phase: box.id, owner, name, position: i, sourceNode: box.id, sopKey: sopKeyFor(name) });
    });
  }
  return out;
}

export interface TickRow {
  task_key: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
}

export function seedWithTicks(seed: SeedTask[], ticks: TickRow[]): (SeedTask & { state: TaskState; doneBy: string | null; doneAt: string | null })[] {
  const done = new Map(ticks.filter((t) => t.done).map((t) => [t.task_key, t]));
  return seed.map((t) => {
    const tick = t.sopKey ? done.get(t.sopKey) : undefined;
    return tick ? { ...t, state: "done", doneBy: tick.done_by, doneAt: tick.done_at } : { ...t, state: "todo", doneBy: null, doneAt: null };
  });
}

type Wiring = { waitsOn?: string[]; mode?: TaskMode };
export type TaskOp =
  | ({ op: "add"; phase: string; owner: TaskOwner; name: string; reason: string } & Wiring)
  | ({ op: "change"; key: string; name?: string; owner?: TaskOwner; phase?: string; reason: string } & Wiring)
  | { op: "cut"; key: string; reason: string };

export function isTaskMode(v: unknown): v is TaskMode {
  return typeof v === "string" && (TASK_MODES as string[]).includes(v);
}

// A list of task keys, or null when it is anything else.
export function waitsList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_WAITS) return null;
  if (v.some((k) => typeof k !== "string" || !k.trim() || k.length > 200)) return null;
  return [...new Set((v as string[]).map((k) => k.trim()))];
}

/**
 * Would `key` waiting on `waitsOn` make a loop? Walks what each named task
 * already waits on; reaching `key` again is a loop.
 */
export function waitsCycle(tasks: Pick<ClientTask, "key" | "waitsOn">[], key: string, waitsOn: string[]): boolean {
  const next = new Map(tasks.map((t) => [t.key, t.key === key ? waitsOn : t.waitsOn ?? []]));
  next.set(key, waitsOn);
  const seen = new Set<string>();
  const stack = [...waitsOn];
  while (stack.length) {
    const k = stack.pop()!;
    if (k === key) return true;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...(next.get(k) ?? []));
  }
  return false;
}

const MAX_OPS = 200;
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

export function isTaskOwner(v: unknown): v is TaskOwner {
  return typeof v === "string" && (TASK_OWNERS as string[]).includes(v);
}

// The Manager's kickoff card, checked before Jake's Approve can apply it.
export function parseTaskOps(v: unknown): { ok: true; ops: TaskOp[] } | { ok: false; error: string } {
  if (!Array.isArray(v)) return { ok: false, error: "ops must be a list" };
  if (v.length > MAX_OPS) return { ok: false, error: `at most ${MAX_OPS} ops` };
  const phases = new Set(taskPhases().map((p) => p.id));
  const ops: TaskOp[] = [];
  for (const [i, raw] of v.entries()) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const bad = (why: string) => ({ ok: false as const, error: `op ${i + 1}: ${why}` });
    const reason = str(o.reason, 500);
    if (!reason) return bad("reason required");
    if (o.phase !== undefined && !phases.has(o.phase as string)) return bad("unknown phase");
    if (o.owner !== undefined && !isTaskOwner(o.owner)) return bad("unknown owner");
    if (o.name !== undefined && !str(o.name, 120)) return bad("name must be 1 to 120 characters");
    if (o.mode !== undefined && !isTaskMode(o.mode)) return bad("mode must be ask or live");
    const waits = o.waitsOn === undefined ? undefined : waitsList(o.waitsOn);
    if (waits === null) return bad(`waitsOn must be a list of at most ${MAX_WAITS} task keys`);
    const wiring = { ...(waits !== undefined ? { waitsOn: waits } : {}), ...(o.mode !== undefined ? { mode: o.mode as TaskMode } : {}) };
    if (o.op === "add") {
      if (o.phase === undefined || o.owner === undefined || o.name === undefined) return bad("add needs phase, owner and name");
      ops.push({ op: "add", phase: o.phase as string, owner: o.owner as TaskOwner, name: str(o.name, 120)!, reason, ...wiring });
    } else if (o.op === "change" || o.op === "cut") {
      const key = str(o.key, 200);
      if (!key) return bad(`${o.op} needs a key`);
      if (o.op === "cut") ops.push({ op: "cut", key, reason });
      else
        ops.push({
          op: "change",
          key,
          reason,
          ...(o.name !== undefined ? { name: str(o.name, 120)! } : {}),
          ...(o.owner !== undefined ? { owner: o.owner as TaskOwner } : {}),
          ...(o.phase !== undefined ? { phase: o.phase as string } : {}),
          ...wiring,
        });
    } else return bad("op must be add, change or cut");
  }
  return { ok: true, ops };
}

export function ownerLabel(o: TaskOwner): string {
  if (o === "client") return "Client";
  if (o === "jake") return "Jake";
  return AGENTS.find((a) => a.id === o)!.name.replace(/ Agent$/, "");
}
