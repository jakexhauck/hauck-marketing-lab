import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "../../src/lib/agents";
import { AGENT_SOPS } from "../../src/lib/agentSops";
import type { ClaimResponse } from "../../src/lib/agentWire";
import {
  agentSopForPrompt,
  boardFor,
  cleanName,
  HOW_MAX,
  isDraftSteps,
  isTellSuggestion,
  moveOrder,
  ownerLabel,
  STAGE_NAME_MAX,
  stepsToHow,
  taskSteps,
  type DirectorResponse,
  type DirectorStage,
  type DirectorTask,
  type SopOwner,
  type TellSuggestion,
} from "../../src/lib/director";
import { writeWithClaude, type ClaudeCreate, sdkCreate } from "./claude";

// The Director's store (migration 0170; docs/build-plans/director.md). Every
// write is the owner's, from /api/admin/director/*. The agents only read, and
// only through the claim (withSop below).
//
// Positions are renumbered 0..n after every move or delete, so the order is
// always exactly what the page last showed.

type Row = Record<string, unknown>;

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const stageFromRow = (r: Row): DirectorStage => ({
  id: r.id as string,
  agent: r.agent as AgentId,
  position: Number(r.position) || 0,
  name: r.name as string,
});

const taskFromRow = (r: Row): DirectorTask => ({
  id: r.id as string,
  agent: r.agent as AgentId,
  stageId: r.stage_id as string,
  position: Number(r.position) || 0,
  name: r.name as string,
  owner: r.owner as SopOwner,
  nodeId: (r.node_id as string | null) ?? null,
  how: (r.how as string | null) ?? null,
  howStatus: r.how_status === "draft" ? "draft" : "set",
  removed: !!r.removed_at,
});

export async function readDirector(client: SupabaseClient, agent?: AgentId): Promise<DirectorResponse> {
  let sq = client.from("agent_sop_stages").select("id, agent, position, name");
  let tq = client.from("agent_sop_tasks").select("id, agent, stage_id, position, name, owner, node_id, how, how_status, removed_at");
  if (agent) {
    sq = sq.eq("agent", agent);
    tq = tq.eq("agent", agent);
  }
  const [s, t] = await Promise.all([sq, tq]);
  fail("read stages", s.error);
  fail("read tasks", t.error);
  return { stages: (s.data ?? []).map(stageFromRow), tasks: (t.data ?? []).map(taskFromRow) };
}

async function readStage(client: SupabaseClient, id: string): Promise<DirectorStage | null> {
  const { data, error } = await client.from("agent_sop_stages").select("id, agent, position, name").eq("id", id).maybeSingle();
  fail("read stage", error);
  return data ? stageFromRow(data) : null;
}

async function readTask(client: SupabaseClient, id: string): Promise<DirectorTask | null> {
  const { data, error } = await client
    .from("agent_sop_tasks")
    .select("id, agent, stage_id, position, name, owner, node_id, how, how_status, removed_at")
    .eq("id", id)
    .maybeSingle();
  fail("read task", error);
  return data ? taskFromRow(data) : null;
}

// Live tasks of one stage, in order (removed ones keep their row but no slot).
async function stageTaskIds(client: SupabaseClient, stageId: string): Promise<string[]> {
  const { data, error } = await client
    .from("agent_sop_tasks")
    .select("id")
    .eq("stage_id", stageId)
    .is("removed_at", null)
    .order("position");
  fail("read stage tasks", error);
  return (data ?? []).map((r) => r.id as string);
}

async function renumber(client: SupabaseClient, table: "agent_sop_tasks" | "agent_sop_stages", ids: string[], extra: Row = {}) {
  const results = await Promise.all(ids.map((id, position) => client.from(table).update({ position, ...extra }).eq("id", id)));
  for (const r of results) fail(`order ${table}`, r.error);
}

export type WriteResult<T> = { ok: T } | { error: 400 | 404 | 409; reason: string };

export interface NewTask {
  stageId: string;
  name: unknown;
  owner: SopOwner;
  // Steps already written (the Tell bar's). Without them Claude drafts some.
  steps?: string[];
}

export async function createTask(
  client: SupabaseClient,
  env: { ANTHROPIC_API_KEY?: string },
  input: NewTask,
  create: ClaudeCreate = sdkCreate,
): Promise<WriteResult<DirectorTask>> {
  const name = cleanName(input.name);
  if (!name) return { error: 400, reason: "name required" };
  const stage = await readStage(client, input.stageId);
  if (!stage) return { error: 404, reason: "stage not found" };

  let steps = (input.steps ?? []).map((s) => s.trim()).filter(Boolean);
  if (!steps.length) {
    const drafted = await draftSteps(env, stage, name, input.owner, await readDirector(client, stage.agent), create);
    steps = drafted.ok ? drafted.data.steps : [];
  }
  const ids = await stageTaskIds(client, stage.id);
  const { data, error } = await client
    .from("agent_sop_tasks")
    .insert({
      agent: stage.agent,
      stage_id: stage.id,
      position: ids.length,
      name,
      owner: input.owner,
      how: steps.length ? stepsToHow(steps).slice(0, HOW_MAX) : null,
      // Always a draft: nothing an agent runs on goes in without Jake's OK.
      how_status: "draft",
    })
    .select("id, agent, stage_id, position, name, owner, node_id, how, how_status, removed_at")
    .single();
  fail("insert task", error);
  return { ok: taskFromRow(data as Row) };
}

export interface TaskPatch {
  name?: unknown;
  owner?: SopOwner;
  // Move: to this stage (same agent), at this index.
  stageId?: string;
  index?: number;
  how?: unknown;
  approve?: boolean;
}

export async function patchTask(client: SupabaseClient, id: string, patch: TaskPatch): Promise<WriteResult<DirectorTask>> {
  const task = await readTask(client, id);
  if (!task || task.removed) return { error: 404, reason: "task not found" };
  // Check a move's target before writing anything, so a bad move saves nothing.
  const toStageId = patch.stageId ?? task.stageId;
  if (toStageId !== task.stageId) {
    const to = await readStage(client, toStageId);
    if (!to || to.agent !== task.agent) return { error: 400, reason: "stage not found" };
  }
  const set: Row = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { error: 400, reason: "name required" };
    set.name = name;
  }
  if (patch.owner) set.owner = patch.owner;
  if (patch.how !== undefined) {
    // Graph boxes keep their steps in code: the SOPs graph is set in stone.
    if (task.nodeId) return { error: 400, reason: "this task's steps live on the graph" };
    if (typeof patch.how !== "string" || patch.how.length > HOW_MAX) return { error: 400, reason: "how too long" };
    set.how = patch.how.trim() || null;
  }
  if (patch.approve) {
    if (task.nodeId) return { error: 400, reason: "nothing to approve" };
    const how = set.how !== undefined ? (set.how as string | null) : task.how;
    if (!how) return { error: 400, reason: "write the steps first" };
    set.how_status = "set";
  } else if (set.how !== undefined && task.howStatus === "set") {
    // Changed steps go back to draft until approved again.
    set.how_status = "draft";
  }
  if (Object.keys(set).length) {
    const { error } = await client.from("agent_sop_tasks").update(set).eq("id", id);
    fail("update task", error);
  }

  if (patch.stageId !== undefined || patch.index !== undefined) {
    const target = moveOrder(await stageTaskIds(client, toStageId), id, patch.index ?? Number.MAX_SAFE_INTEGER);
    await renumber(client, "agent_sop_tasks", target, { stage_id: toStageId });
    if (toStageId !== task.stageId) await renumber(client, "agent_sop_tasks", await stageTaskIds(client, task.stageId));
  }
  return { ok: (await readTask(client, id))! };
}

// A graph box's task is only switched off, so the graph can show it as Off and
// an Undo can bring it back. A task Jake added is deleted outright.
export async function removeTask(client: SupabaseClient, id: string): Promise<WriteResult<true>> {
  const task = await readTask(client, id);
  if (!task) return { error: 404, reason: "task not found" };
  const { error } = task.nodeId
    ? await client.from("agent_sop_tasks").update({ removed_at: new Date().toISOString() }).eq("id", id)
    : await client.from("agent_sop_tasks").delete().eq("id", id);
  fail("remove task", error);
  await renumber(client, "agent_sop_tasks", await stageTaskIds(client, task.stageId));
  return { ok: true };
}

// Undo for an Off graph box: back at the end of its old stage.
export async function restoreTask(client: SupabaseClient, id: string): Promise<WriteResult<DirectorTask>> {
  const task = await readTask(client, id);
  if (!task) return { error: 404, reason: "task not found" };
  if (!task.removed) return { ok: task };
  const ids = await stageTaskIds(client, task.stageId);
  const { error } = await client.from("agent_sop_tasks").update({ removed_at: null, position: ids.length }).eq("id", id);
  fail("restore task", error);
  return { ok: (await readTask(client, id))! };
}

export async function createStage(client: SupabaseClient, agent: AgentId, name: unknown): Promise<WriteResult<DirectorStage>> {
  const clean = cleanName(name, STAGE_NAME_MAX);
  if (!clean) return { error: 400, reason: "name required" };
  const { count, error: cErr } = await client
    .from("agent_sop_stages")
    .select("id", { count: "exact", head: true })
    .eq("agent", agent);
  fail("count stages", cErr);
  const { data, error } = await client
    .from("agent_sop_stages")
    .insert({ agent, name: clean, position: count ?? 0 })
    .select("id, agent, position, name")
    .single();
  fail("insert stage", error);
  return { ok: stageFromRow(data as Row) };
}

export async function patchStage(
  client: SupabaseClient,
  id: string,
  patch: { name?: unknown; index?: number },
): Promise<WriteResult<DirectorStage>> {
  const stage = await readStage(client, id);
  if (!stage) return { error: 404, reason: "stage not found" };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name, STAGE_NAME_MAX);
    if (!name) return { error: 400, reason: "name required" };
    const { error } = await client.from("agent_sop_stages").update({ name }).eq("id", id);
    fail("rename stage", error);
  }
  if (patch.index !== undefined) {
    const { data, error } = await client.from("agent_sop_stages").select("id").eq("agent", stage.agent).order("position");
    fail("read stages", error);
    await renumber(client, "agent_sop_stages", moveOrder((data ?? []).map((r) => r.id as string), id, patch.index));
  }
  return { ok: (await readStage(client, id))! };
}

// Only an empty stage goes, so a task (and a graph box's Off state) is never
// lost by deleting the column around it.
export async function deleteStage(client: SupabaseClient, id: string): Promise<WriteResult<true>> {
  const stage = await readStage(client, id);
  if (!stage) return { error: 404, reason: "stage not found" };
  const { count, error: cErr } = await client
    .from("agent_sop_tasks")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  fail("count tasks", cErr);
  if ((count ?? 0) > 0) return { error: 409, reason: "move or delete its tasks first" };
  const { error } = await client.from("agent_sop_stages").delete().eq("id", id);
  fail("delete stage", error);
  const { data, error: rErr } = await client.from("agent_sop_stages").select("id").eq("agent", stage.agent).order("position");
  fail("read stages", rErr);
  await renumber(client, "agent_sop_stages", (data ?? []).map((r) => r.id as string));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

// The short name ("GHL"); ownerLabel adds "Agent".
const agentName = (agent: AgentId) => AGENT_SOPS.find((a) => a.id === agent)?.name ?? agent;

// The board as Claude sees it: stages numbered from 0, each task with its
// owner and steps, so new steps match how this agent already works.
export function boardText(agent: AgentId, data: DirectorResponse): string {
  return boardFor(agent, data)
    .map(({ stage, tasks }, i) => {
      const lines = tasks.map((t) => {
        const steps = taskSteps(t);
        return `- ${t.name} (${ownerLabel(t.owner, agentName(agent))})${steps.length ? `: ${steps.join("; ")}` : ""}`;
      });
      return `Stage ${i}: ${stage.name}\n${lines.join("\n") || "- (empty)"}`;
    })
    .join("\n\n");
}

const STEPS_SYSTEM = `You write SOP steps for one AI agent at Hauck Marketing, an agency that runs Facebook lead ads and GoHighLevel follow-up for local home service businesses.
You get the agent's whole SOP board and one new task. Write the steps for that task only: 2 to 6 short imperative lines, each one concrete thing to do, in the same plain style as the board. No numbering, no em dashes, no filler.`;

const STEPS_SCHEMA = {
  type: "object",
  properties: { steps: { type: "array", items: { type: "string" } } },
  required: ["steps"],
  additionalProperties: false,
};

export function draftSteps(
  env: { ANTHROPIC_API_KEY?: string },
  stage: DirectorStage,
  name: string,
  owner: SopOwner,
  data: DirectorResponse,
  create: ClaudeCreate = sdkCreate,
) {
  return writeWithClaude(
    env,
    {
      system: STEPS_SYSTEM,
      input: `Agent: ${agentName(stage.agent)}\n\nBoard:\n${boardText(stage.agent, data)}\n\nNew task in stage "${stage.name}": ${name} (${ownerLabel(owner, agentName(stage.agent))})`,
      schema: STEPS_SCHEMA,
      check: isDraftSteps,
      maxTokens: 1500,
    },
    create,
  );
}

const TELL_SYSTEM = `You turn Jake's plain instruction into one new task on an AI agent's SOP board at Hauck Marketing (Facebook lead ads and GoHighLevel follow-up for local home service businesses).
Pick the stage it belongs in by its number (stages count from 0), a short task name that starts with a verb (under 8 words), who does it (agent = the AI agent, jake = Jake himself, client = the business owner), and 2 to 6 short imperative steps. Match the board's plain style. No em dashes.`;

const TELL_SCHEMA = {
  type: "object",
  properties: {
    stage: { type: "integer" },
    name: { type: "string" },
    owner: { type: "string", enum: ["agent", "jake", "client"] },
    steps: { type: "array", items: { type: "string" } },
  },
  required: ["stage", "name", "owner", "steps"],
  additionalProperties: false,
};

export async function suggestTask(
  client: SupabaseClient,
  env: { ANTHROPIC_API_KEY?: string },
  agent: AgentId,
  text: string,
  create: ClaudeCreate = sdkCreate,
): Promise<{ ok: true; suggestion: TellSuggestion & { stageId: string } } | { ok: false; error: string }> {
  const data = await readDirector(client, agent);
  const board = boardFor(agent, data);
  if (!board.length) return { ok: false, error: "This agent has no stages yet" };
  const res = await writeWithClaude(
    env,
    {
      system: TELL_SYSTEM,
      input: `Agent: ${agentName(agent)}\n\nBoard:\n${boardText(agent, data)}\n\nJake says: ${text}`,
      schema: TELL_SCHEMA,
      check: isTellSuggestion,
      maxTokens: 1500,
    },
    create,
  );
  if (!res.ok) return res;
  const stage = board[Math.min(res.data.stage, board.length - 1)].stage;
  const name = cleanName(res.data.name) ?? res.data.name.slice(0, 120);
  return { ok: true, suggestion: { ...res.data, name, stage: stage.position, stageId: stage.id } };
}

// ---------------------------------------------------------------------------
// The claim
// ---------------------------------------------------------------------------

// The agent's own SOP rides along with every claim. A failed read must not lose
// the claimed message: the agent answers without it.
export async function withSop(client: SupabaseClient, claim: ClaimResponse | null): Promise<ClaimResponse | null> {
  if (!claim) return null;
  try {
    const agent = claim.chat.agent;
    return { ...claim, sop: agentSopForPrompt(agent, await readDirector(client, agent)) };
  } catch (err) {
    console.error(`claim: sop read failed: ${(err as Error).message}`);
    return claim;
  }
}
