import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerLabel, type ClientTask } from "../../src/lib/clientTasks";
import type { AgentId } from "../../src/lib/agents";
import { toTask } from "./clientTasks";

// Task handoffs (Jake, 2026-10-20; docs/build-plans/four-agents-and-handoffs.md,
// Build B). A Director task can wait on others. When the last of them is done
// or cut, the task's agent is started on its own: the task moves to doing and
// a `trigger` message is queued in that agent's "Tasks" chat at the client,
// carrying the proof and outputs of what it waited on.
//
// startReady is called wherever a task finishes: Jake's tick (patchTask), a
// cut on the CSM's card (applyTaskOps) and an agent's ```task block
// (agentTaskUpdate). Each child is moved todo -> doing with a conditional
// update, so of two callers racing only the one whose update lands starts it.
// Jake's and the client's tasks are never started; they just become ready on
// the board (a gate is a task of Jake's).
//
// A trigger is never role "me": the GHL write gate reads a plain "me" as Jake's
// own ask. meta.live is true only when every task it carries acts live.

type Row = Record<string, unknown>;

const AGENT_OWNERS = new Set<string>(["csm", "research", "ads", "ghl"]);
const finished = (t: ClientTask | undefined) => !!t && (t.state === "done" || t.state === "cut");

/** Tasks that can start now because one of `finishedKeys` was the last thing they waited on. */
export function readyChildren(tasks: ClientTask[], finishedKeys: string[]): ClientTask[] {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const just = new Set(finishedKeys);
  return tasks.filter(
    (t) =>
      t.state === "todo" &&
      AGENT_OWNERS.has(t.owner) &&
      t.waitsOn.length > 0 &&
      t.waitsOn.some((k) => just.has(k)) &&
      t.waitsOn.every((k) => finished(byKey.get(k))),
  );
}

function proofOf(t: ClientTask): string {
  if (t.state === "cut") return `cut${t.reason ? `: ${t.reason}` : ""}`;
  return t.evidence || t.note || "done";
}

/** The trigger message: the tasks to do, then what the tasks they waited on handed over. */
export function triggerBody(children: ClientTask[], parents: ClientTask[]): string {
  const todo = children.map((c) => {
    const steps = c.steps.map((s, i) => `   ${i + 1}. ${s}`).join("\n");
    return `- ${c.key}: ${c.name}${steps ? `\n${steps}` : ""}`;
  });
  const handed = parents.map((p) => {
    const outs = Object.entries(p.outputs).map(([k, v]) => `   ${k}: ${v}`);
    return [`- ${p.name} (${ownerLabel(p.owner)}): ${proofOf(p)}`, ...outs].join("\n");
  });
  return [
    "The Director started these tasks for you, because everything they waited on is finished. Do these tasks and nothing else, and mark each one with a ```task block.",
    "",
    ...todo,
    ...(handed.length ? ["", "Handed over", ...handed] : []),
  ].join("\n");
}

async function tasksChat(client: SupabaseClient, tenantId: string, agent: AgentId): Promise<string> {
  const { data, error } = await client
    .from("agent_chats")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("agent", agent)
    .eq("title", "Tasks")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`tasks chat: ${error.message}`);
  const found = ((data ?? []) as Row[])[0]?.id as string | undefined;
  if (found) return found;
  const { data: made, error: mErr } = await client
    .from("agent_chats")
    .insert({ tenant_id: tenantId, agent, title: "Tasks", auto: false, user_id: null })
    .select("id")
    .maybeSingle();
  if (mErr || !made) throw new Error(`tasks chat: ${mErr?.message ?? "no row"}`);
  return (made as Row).id as string;
}

/** Queue a Director trigger in the agent's Tasks chat at this client. */
export async function queueTrigger(
  client: SupabaseClient,
  tenantId: string,
  agent: AgentId,
  body: string,
  meta: { taskKeys: string[]; live: boolean },
): Promise<string> {
  const chatId = await tasksChat(client, tenantId, agent);
  const { data, error } = await client
    .from("agent_messages")
    .insert({ chat_id: chatId, role: "trigger", body, status: "queued", meta })
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(`trigger: ${error?.message ?? "no row"}`);
  await client.from("agent_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
  return (data as Row).id as string;
}

export async function startReady(client: SupabaseClient, tenantId: string, finishedKeys: string[]): Promise<{ started: string[] }> {
  if (!finishedKeys.length) return { started: [] };
  const { data, error } = await client.from("client_tasks").select("*").eq("tenant_id", tenantId);
  if (error) throw new Error(`client_tasks read: ${error.message}`);
  const tasks = ((data ?? []) as Row[]).map(toTask);
  const won: ClientTask[] = [];
  for (const t of readyChildren(tasks, finishedKeys)) {
    const { data: moved, error: mErr } = await client
      .from("client_tasks")
      .update({ state: "doing" })
      .eq("tenant_id", tenantId)
      .eq("id", t.id)
      .eq("state", "todo")
      .select("id");
    if (!mErr && ((moved ?? []) as Row[]).length) won.push({ ...t, state: "doing" });
  }
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const started: string[] = [];
  for (const owner of [...new Set(won.map((t) => t.owner))]) {
    const children = won.filter((t) => t.owner === owner);
    const parents = [...new Set(children.flatMap((c) => c.waitsOn))].map((k) => byKey.get(k)!).filter(Boolean);
    try {
      await queueTrigger(client, tenantId, owner as AgentId, triggerBody(children, parents), {
        taskKeys: children.map((c) => c.key),
        live: children.every((c) => c.mode === "live"),
      });
      started.push(...children.map((c) => c.key));
    } catch (err) {
      // No agent got the message, so the tasks must not sit in Doing: back to
      // to do (only if still doing), where Jake sees them and can name them.
      console.error(`handoffs: trigger for ${owner} not queued: ${(err as Error).message}`);
      for (const c of children) {
        await client.from("client_tasks").update({ state: "todo" }).eq("tenant_id", tenantId).eq("id", c.id).eq("state", "doing");
      }
    }
  }
  return { started };
}

/** startReady for the callers that must never fail on it: a finished task stays finished. */
export async function startReadyQuietly(client: SupabaseClient, tenantId: string, finishedKeys: string[]): Promise<void> {
  try {
    await startReady(client, tenantId, finishedKeys);
  } catch (err) {
    console.error(`handoffs: ${(err as Error).message}`);
  }
}
