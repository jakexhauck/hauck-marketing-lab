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

export type TaskOwner = "client" | "jake" | AgentId;
export type TaskState = "todo" | "doing" | "done" | "cut";

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
}

// Row order on the Director.
export const TASK_OWNERS: TaskOwner[] = ["client", "jake", "manager", "research", "ghl", "ads", "creative", "landing", "reporting"];

const PREFIX: Record<string, TaskOwner> = {
  manager: "manager",
  ghl: "ghl",
  jake: "jake",
  client: "client",
  ads: "ads",
  creative: "creative",
  "landing page": "landing",
  reporting: "reporting",
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
  return "manager";
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

export type TaskOp =
  | { op: "add"; phase: string; owner: TaskOwner; name: string; reason: string }
  | { op: "change"; key: string; name?: string; owner?: TaskOwner; phase?: string; reason: string }
  | { op: "cut"; key: string; reason: string };

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
    if (o.op === "add") {
      if (o.phase === undefined || o.owner === undefined || o.name === undefined) return bad("add needs phase, owner and name");
      ops.push({ op: "add", phase: o.phase as string, owner: o.owner as TaskOwner, name: str(o.name, 120)!, reason });
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
