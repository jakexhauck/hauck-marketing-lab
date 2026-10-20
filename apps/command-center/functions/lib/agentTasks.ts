import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimResponse, RunnerTaskBody, RunnerTaskResult, WireTask } from "../../src/lib/agentWire";
import { turnChat } from "./clientBriefs";
import { ensureTasks, toTask } from "./clientTasks";

// Agents and the per-client Director (docs/build-plans/client-fulfillment-and-director.md).
//
// withTasks puts the client's tasks in every claim as prompt context: the
// Manager sees all of them, any other agent its own. The text only ever
// reaches an agent there, never as a role "me" message, because the GHL and
// Meta write gates read a "me" message as Jake's ask.
//
// agentTaskUpdate is the ```task block: an agent moves its own tasks forward
// (to doing, or done with evidence or a note). Who is writing comes from the
// claimed message, never from the request. Agents never untick; only Jake does.

type Row = Record<string, unknown>;
const MAX_UPDATES = 50;

export async function withTasks(client: SupabaseClient, claim: ClaimResponse | null): Promise<ClaimResponse | null> {
  if (!claim || !claim.chat.tenantId) return claim;
  try {
    const all = await ensureTasks(client, claim.chat.tenantId);
    const mine = claim.chat.agent === "manager" ? all : all.filter((t) => t.owner === claim.chat.agent);
    const tasks: WireTask[] = mine.map((t) => ({ key: t.key, name: t.name, owner: t.owner, phase: t.phase, state: t.state, reason: t.reason }));
    return { ...claim, tasks };
  } catch (err) {
    // A failed read must not lose the claimed message: the agent answers without its tasks.
    console.error(`claim: tasks read failed: ${(err as Error).message}`);
    return claim;
  }
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function agentTaskUpdate(
  client: SupabaseClient,
  body: RunnerTaskBody,
  now: Date = new Date(),
): Promise<RunnerTaskResult | { error: 400 | 403 | 404 | 409; reason: string }> {
  const turn = await turnChat(client, body?.messageId);
  if ("error" in turn) return turn;
  const updates = Array.isArray(body.updates) ? body.updates : null;
  if (!updates) return { error: 400, reason: "updates required" };
  if (updates.length > MAX_UPDATES) return { error: 400, reason: `at most ${MAX_UPDATES} updates` };

  const { data, error } = await client.from("client_tasks").select("*").eq("tenant_id", turn.tenantId);
  if (error) throw new Error(`client_tasks read: ${error.message}`);
  const byKey = new Map(((data ?? []) as Row[]).map((r) => [r.key as string, toTask(r)]));

  const out: RunnerTaskResult = { updated: [], refused: [] };
  for (const u of updates) {
    const key = typeof u?.key === "string" ? u.key : "";
    const refuse = (reason: string) => out.refused.push({ key, reason });
    const t = byKey.get(key);
    if (!t) {
      refuse("no task with that key");
      continue;
    }
    if (t.owner !== turn.agent) {
      refuse("not your task");
      continue;
    }
    if (t.state === "cut") {
      refuse("cut");
      continue;
    }
    if (u.state !== "doing" && u.state !== "done") {
      refuse("agents only move a task to doing or done");
      continue;
    }
    if (t.state === "done") {
      refuse("already done");
      continue;
    }
    const evidence = text(u.evidence, 2000);
    const note = text(u.note, 2000);
    if (u.state === "done" && !evidence && !note) {
      refuse("done needs evidence or a note");
      continue;
    }
    const patch: Row =
      u.state === "done"
        ? { state: "done", done_by: `agent:${turn.agent}`, done_at: now.toISOString(), ...(evidence ? { evidence } : {}), ...(note ? { note } : {}) }
        : { state: "doing", ...(note ? { note } : {}) };
    const { error: upErr } = await client.from("client_tasks").update(patch).eq("tenant_id", turn.tenantId).eq("id", t.id);
    if (upErr) {
      refuse(upErr.message);
      continue;
    }
    byKey.set(key, { ...t, state: u.state });
    out.updated.push(key);
  }
  return out;
}
