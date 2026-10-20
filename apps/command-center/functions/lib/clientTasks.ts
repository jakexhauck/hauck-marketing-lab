import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isTaskOwner,
  seedTasks,
  seedWithTicks,
  slug,
  taskPhases,
  type ClientTask,
  type TaskOp,
  type TaskOwner,
  type TaskState,
  type TickRow,
} from "../../src/lib/clientTasks";

// The client_tasks store (0173): the per-client Director. Jake edits through
// /api/admin/client-tasks, agents move their own tasks through
// /api/agent-runner/task (lib/agentTasks.ts), and the Manager's kickoff card
// is applied here on Jake's Approve (lib/agentItems.ts). A client is seeded
// from the Client Fulfillment map the first time its tasks are read.

type Row = Record<string, unknown>;
type Fail = { error: 400 | 404; reason: string };

const STATES: TaskState[] = ["todo", "doing", "done", "cut"];

export function toTask(r: Row): ClientTask {
  return {
    id: r.id as string,
    key: r.key as string,
    phase: r.phase as string,
    owner: r.owner as TaskOwner,
    name: r.name as string,
    position: (r.position as number) ?? 0,
    sourceNode: (r.source_node as string | null) ?? null,
    sopKey: (r.sop_key as string | null) ?? null,
    steps: Array.isArray(r.steps) ? (r.steps as string[]) : [],
    state: r.state as TaskState,
    change: r.change as ClientTask["change"],
    reason: (r.reason as string | null) ?? null,
    evidence: (r.evidence as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    doneBy: (r.done_by as string | null) ?? null,
    doneAt: (r.done_at as string | null) ?? null,
  };
}

// Phase order first, then position, then name, so the board and the prompts
// read in map order.
function sortTasks(tasks: ClientTask[]): ClientTask[] {
  const at = new Map(taskPhases().map((p, i) => [p.id, i]));
  return tasks.sort(
    (a, b) => (at.get(a.phase) ?? 99) - (at.get(b.phase) ?? 99) || a.position - b.position || a.name.localeCompare(b.name),
  );
}

async function readTasks(client: SupabaseClient, tenantId: string): Promise<ClientTask[]> {
  const { data, error } = await client.from("client_tasks").select("*").eq("tenant_id", tenantId);
  if (error) throw new Error(`client_tasks read: ${error.message}`);
  return sortTasks(((data ?? []) as Row[]).map(toTask));
}

// Seed on first read. The unique (tenant_id, key) plus ignoreDuplicates means
// two first reads at once still leave one set.
export async function ensureTasks(client: SupabaseClient, tenantId: string): Promise<ClientTask[]> {
  const have = await readTasks(client, tenantId);
  if (have.length) return have;
  const { data: ticks, error } = await client
    .from("onboarding_checklist")
    .select("task_key, done, done_by, done_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`onboarding_checklist read: ${error.message}`);
  const rows = seedWithTicks(seedTasks(), (ticks ?? []) as TickRow[]).map((t) => ({
    tenant_id: tenantId,
    key: t.key,
    phase: t.phase,
    owner: t.owner,
    name: t.name,
    position: t.position,
    source_node: t.sourceNode,
    sop_key: t.sopKey,
    state: t.state,
    done_by: t.doneBy,
    done_at: t.doneAt,
    created_by: "seed",
  }));
  const { error: insErr } = await client.from("client_tasks").upsert(rows, { onConflict: "tenant_id,key", ignoreDuplicates: true });
  if (insErr) throw new Error(`client_tasks seed: ${insErr.message}`);
  return readTasks(client, tenantId);
}

const phaseOk = (p: unknown) => typeof p === "string" && taskPhases().some((x) => x.id === p);
const nameOk = (n: unknown) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 120;

async function freeKey(client: SupabaseClient, tenantId: string, name: string): Promise<string> {
  const base = `added:${slug(name) || "task"}`;
  const { data } = await client.from("client_tasks").select("key").eq("tenant_id", tenantId);
  const taken = new Set(((data ?? []) as Row[]).map((r) => r.key as string));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

async function insertAdded(
  client: SupabaseClient,
  tenantId: string,
  body: { phase: string; owner: TaskOwner; name: string; steps?: string[]; reason?: string | null },
  by: string,
): Promise<ClientTask> {
  const { data, error } = await client
    .from("client_tasks")
    .insert({
      tenant_id: tenantId,
      key: await freeKey(client, tenantId, body.name),
      phase: body.phase,
      owner: body.owner,
      name: body.name.trim(),
      steps: body.steps ?? [],
      position: 1000,
      change: "added",
      reason: body.reason ?? null,
      created_by: by,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) throw new Error(`client_tasks insert: ${error?.message ?? "no row"}`);
  return toTask(data as Row);
}

export async function createTask(
  client: SupabaseClient,
  tenantId: string,
  body: { phase: unknown; owner: unknown; name: unknown; steps?: unknown },
  by: string,
): Promise<ClientTask | Fail> {
  if (!phaseOk(body.phase)) return { error: 400, reason: "unknown phase" };
  if (!isTaskOwner(body.owner)) return { error: 400, reason: "unknown owner" };
  if (!nameOk(body.name)) return { error: 400, reason: "name must be 1 to 120 characters" };
  const steps = Array.isArray(body.steps) ? body.steps.filter((s): s is string => typeof s === "string").slice(0, 50) : [];
  return insertAdded(client, tenantId, { phase: body.phase as string, owner: body.owner, name: body.name as string, steps }, by);
}

export interface TaskPatch {
  name?: string;
  owner?: TaskOwner;
  phase?: string;
  position?: number;
  steps?: string[];
  state?: TaskState;
  note?: string | null;
  evidence?: string | null;
  reason?: string | null;
}

export async function patchTask(client: SupabaseClient, tenantId: string, id: string, patch: TaskPatch, by: string): Promise<ClientTask | Fail> {
  const update: Row = {};
  if (patch.name !== undefined) {
    if (!nameOk(patch.name)) return { error: 400, reason: "name must be 1 to 120 characters" };
    update.name = patch.name.trim();
  }
  if (patch.owner !== undefined) {
    if (!isTaskOwner(patch.owner)) return { error: 400, reason: "unknown owner" };
    update.owner = patch.owner;
  }
  if (patch.phase !== undefined) {
    if (!phaseOk(patch.phase)) return { error: 400, reason: "unknown phase" };
    update.phase = patch.phase;
  }
  if (patch.position !== undefined) {
    if (!Number.isInteger(patch.position)) return { error: 400, reason: "position must be a whole number" };
    update.position = patch.position;
  }
  if (patch.steps !== undefined) {
    if (!Array.isArray(patch.steps) || patch.steps.some((s) => typeof s !== "string")) return { error: 400, reason: "steps must be a list of text" };
    update.steps = patch.steps.slice(0, 50);
  }
  for (const k of ["note", "evidence", "reason"] as const) {
    if (patch[k] !== undefined) {
      if (patch[k] !== null && typeof patch[k] !== "string") return { error: 400, reason: `${k} must be text` };
      update[k] = patch[k] ? (patch[k] as string).slice(0, 2000) : null;
    }
  }
  if (patch.state !== undefined) {
    if (!STATES.includes(patch.state)) return { error: 400, reason: "unknown state" };
    update.state = patch.state;
    const done = patch.state === "done";
    update.done_by = done ? by : null;
    update.done_at = done ? new Date().toISOString() : null;
  }
  const { data, error } = await client.from("client_tasks").update(update).eq("tenant_id", tenantId).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`client_tasks update: ${error.message}`);
  if (!data) return { error: 404, reason: "no such task" };
  return toTask(data as Row);
}

export async function deleteTask(client: SupabaseClient, tenantId: string, id: string): Promise<boolean> {
  const { data } = await client.from("client_tasks").select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!data) return false;
  const { error } = await client.from("client_tasks").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(`client_tasks delete: ${error.message}`);
  return true;
}

// The Manager's kickoff card, on Jake's Approve. Every op that can apply does;
// one naming a task that is gone is reported, never thrown, so a card approved
// after Jake edited the board still lands everything else.
export async function applyTaskOps(
  client: SupabaseClient,
  tenantId: string,
  ops: TaskOp[],
  by: string,
): Promise<{ applied: number; skipped: { op: TaskOp; reason: string }[] }> {
  const tasks = await ensureTasks(client, tenantId);
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const skipped: { op: TaskOp; reason: string }[] = [];
  let applied = 0;
  for (const op of ops) {
    if (op.op === "add") {
      await insertAdded(client, tenantId, { phase: op.phase, owner: op.owner, name: op.name, reason: op.reason }, by);
      applied++;
      continue;
    }
    const t = byKey.get(op.key);
    if (!t) {
      skipped.push({ op, reason: "no task with that key" });
      continue;
    }
    const update: Row =
      op.op === "cut"
        ? { state: "cut", reason: op.reason, done_by: null, done_at: null }
        : {
            change: t.change === "added" ? "added" : "changed",
            reason: op.reason,
            ...(op.name !== undefined ? { name: op.name } : {}),
            ...(op.owner !== undefined ? { owner: op.owner } : {}),
            ...(op.phase !== undefined ? { phase: op.phase } : {}),
          };
    const { error } = await client.from("client_tasks").update(update).eq("tenant_id", tenantId).eq("id", t.id);
    if (error) skipped.push({ op, reason: error.message });
    else applied++;
  }
  return { applied, skipped };
}
