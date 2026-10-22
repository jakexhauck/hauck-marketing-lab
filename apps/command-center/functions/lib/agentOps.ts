import type { SupabaseClient } from "@supabase/supabase-js";
import { isAgentId, type AgentId } from "../../src/lib/agents";
import type {
  AgentHealth,
  AgentJob,
  AgentOpsBody,
  AgentOpsCommand,
  AgentOpsResponse,
  AgentOpsView,
  AgentUsageDay,
  JobAction,
} from "../../src/lib/agentWire";
import { runnerStatus } from "./agentItems";

// Each agent's settings: health, cost, schedules, skills (migration 0180;
// docs/build-plans/hermes-agent-ops.md, Phase 4). The runner reads Hermes and
// posts here; the Settings tab reads it back. A pause or run Jake asks for is
// queued and handed to the runner in the answer to its next post, because
// nothing in the cloud can reach the VPS.

type Row = Record<string, unknown>;

export const JOB_ACTIONS: JobAction[] = ["pause", "resume", "run"];
const VPS_HOST = "hauck-vps";
const MAX_DAYS = 31;

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.slice(0, max) : "");
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function cleanHealth(h: unknown): AgentHealth {
  const o = (h && typeof h === "object" ? h : {}) as Row;
  return { status: str(o.status, 60) || "unknown", gateway: str(o.gateway, 60) || null, error: str(o.error) || null };
}

function cleanJobs(j: unknown): AgentJob[] {
  return (Array.isArray(j) ? j : []).slice(0, 100).flatMap((raw) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Row;
    const id = str(o.id, 100);
    if (!id) return [];
    return [
      {
        id,
        name: str(o.name, 200) || id,
        schedule: str(o.schedule, 200),
        enabled: o.enabled !== false,
        nextRunAt: str(o.nextRunAt, 40) || null,
        lastRunAt: str(o.lastRunAt, 40) || null,
        lastStatus: str(o.lastStatus, 60) || null,
      },
    ];
  });
}

function usageRow(agent: AgentId, u: AgentUsageDay, stamp: string): Row {
  return {
    agent,
    day: u.day,
    sessions: Math.max(0, Math.round(num(u.sessions))),
    api_calls: Math.max(0, Math.round(num(u.apiCalls))),
    input_tokens: Math.max(0, Math.round(num(u.inputTokens))),
    output_tokens: Math.max(0, Math.round(num(u.outputTokens))),
    cache_read_tokens: Math.max(0, Math.round(num(u.cacheReadTokens))),
    cache_write_tokens: Math.max(0, Math.round(num(u.cacheWriteTokens))),
    est_cost_usd: Math.max(0, num(u.estCostUsd)),
    updated_at: stamp,
  };
}

function dayFromRow(r: Row): AgentUsageDay {
  return {
    day: String(r.day).slice(0, 10),
    sessions: num(r.sessions),
    apiCalls: num(r.api_calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheReadTokens: num(r.cache_read_tokens),
    cacheWriteTokens: num(r.cache_write_tokens),
    estCostUsd: num(r.est_cost_usd),
  };
}

const empty = (day: string): AgentUsageDay => ({
  day,
  sessions: 0,
  apiCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  estCostUsd: 0,
});

export function sumDays(days: AgentUsageDay[], label: string): AgentUsageDay {
  return days.reduce(
    (t, d) => ({
      day: label,
      sessions: t.sessions + d.sessions,
      apiCalls: t.apiCalls + d.apiCalls,
      inputTokens: t.inputTokens + d.inputTokens,
      outputTokens: t.outputTokens + d.outputTokens,
      cacheReadTokens: t.cacheReadTokens + d.cacheReadTokens,
      cacheWriteTokens: t.cacheWriteTokens + d.cacheWriteTokens,
      estCostUsd: Math.round((t.estCostUsd + d.estCostUsd) * 10_000) / 10_000,
    }),
    empty(label),
  );
}

/** The runner's post: save what it read, close the commands it ran, hand it the next ones. */
export async function saveAgentOps(client: SupabaseClient, body: AgentOpsBody, now: Date = new Date()): Promise<AgentOpsResponse | { error: 400 }> {
  if (!body || !Array.isArray(body.agents)) return { error: 400 };
  const stamp = now.toISOString();
  for (const r of body.agents) {
    if (!isAgentId(r?.agent)) continue;
    const { error } = await client.from("agent_ops").upsert(
      {
        agent: r.agent,
        health: cleanHealth(r.health),
        jobs: cleanJobs(r.jobs),
        skills: (Array.isArray(r.skills) ? r.skills : []).map((s) => str(s, 100)).filter(Boolean).slice(0, 100),
        collected_at: stamp,
      },
      { onConflict: "agent" },
    );
    fail("agent ops", error);
    const days = (Array.isArray(r.usage) ? r.usage : []).filter((u) => isDay(u?.day)).slice(0, MAX_DAYS);
    if (days.length) {
      const { error: uErr } = await client.from("agent_usage_daily").upsert(days.map((u) => usageRow(r.agent, u, stamp)), { onConflict: "agent,day" });
      fail("agent usage", uErr);
    }
  }

  for (const d of Array.isArray(body.done) ? body.done : []) {
    if (typeof d?.id !== "string") continue;
    const { error } = await client
      .from("agent_ops_commands")
      .update({ status: d.ok ? "done" : "failed", result: str(d.result, 1000), done_at: stamp })
      .eq("id", d.id)
      .eq("status", "queued");
    fail("ops command", error);
  }

  const { data, error } = await client.from("agent_ops_commands").select("*").eq("status", "queued").order("created_at", { ascending: true }).limit(20);
  fail("ops commands", error);
  const commands: AgentOpsCommand[] = ((data ?? []) as Row[])
    .filter((r) => isAgentId(r.agent as string))
    .map((r) => ({ id: r.id as string, agent: r.agent as AgentId, jobId: r.job_id as string, action: r.action as JobAction }));
  return { commands };
}

/** Jake's pause, resume or run, for the runner to carry out. */
export async function queueJobCommand(
  client: SupabaseClient,
  agent: string,
  jobId: string,
  action: string,
): Promise<{ id: string } | { error: 400 | 404; reason: string }> {
  if (!isAgentId(agent)) return { error: 400, reason: "unknown agent" };
  if (!JOB_ACTIONS.includes(action as JobAction)) return { error: 400, reason: "action must be pause, resume or run" };
  const { data: ops, error } = await client.from("agent_ops").select("jobs").eq("agent", agent).maybeSingle();
  fail("agent ops", error);
  // Only a job the runner has reported: an id typed by hand never reaches Hermes.
  const known = cleanJobs((ops as Row | null)?.jobs).some((j) => j.id === jobId);
  if (!known) return { error: 404, reason: "no such job" };
  const { data, error: iErr } = await client.from("agent_ops_commands").insert({ agent, job_id: jobId, action }).select("id").maybeSingle();
  fail("ops command", iErr);
  return { id: (data as Row).id as string };
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** One agent's Settings tab. */
export async function readAgentOps(client: SupabaseClient, agent: AgentId, now: Date = new Date()): Promise<AgentOpsView> {
  const { data: ops, error } = await client.from("agent_ops").select("*").eq("agent", agent).maybeSingle();
  fail("agent ops", error);
  const o = (ops ?? null) as Row | null;

  const since = new Date(now.getTime() - 29 * 86_400_000);
  const { data: usage, error: uErr } = await client.from("agent_usage_daily").select("*").eq("agent", agent).gte("day", dayOf(since)).order("day", { ascending: true });
  fail("agent usage", uErr);
  const days = ((usage ?? []) as Row[]).map(dayFromRow);
  const today = dayOf(now);
  const weekFrom = dayOf(new Date(now.getTime() - 6 * 86_400_000));

  const { data: hosts, error: hErr } = await client.from("agent_runner_state").select("host, last_seen_at");
  fail("runner state", hErr);
  const hostRows = (hosts ?? []) as { host: string; last_seen_at: string | null }[];
  const vps = hostRows.filter((h) => h.host === VPS_HOST);

  // The last turn and the last failure, from this agent's own chats.
  const { data: chats, error: cErr } = await client.from("agent_chats").select("id").eq("agent", agent).order("updated_at", { ascending: false }).limit(200);
  fail("agent chats", cErr);
  const chatIds = ((chats ?? []) as Row[]).map((c) => c.id as string);
  let lastTurnAt: string | null = null;
  let lastError: AgentOpsView["lastError"] = null;
  if (chatIds.length) {
    const { data: msgs, error: mErr } = await client
      .from("agent_messages")
      .select("status, error, created_at")
      .in("chat_id", chatIds)
      .eq("role", "ai")
      .order("created_at", { ascending: false })
      .limit(50);
    fail("agent messages", mErr);
    const rows = (msgs ?? []) as Row[];
    lastTurnAt = (rows[0]?.created_at as string) ?? null;
    const bad = rows.find((m) => m.status === "error");
    if (bad) lastError = { at: bad.created_at as string, error: str(bad.error, 500) || "failed" };
  }

  const { data: queued, error: qErr } = await client.from("agent_ops_commands").select("*").eq("agent", agent).eq("status", "queued");
  fail("ops commands", qErr);

  return {
    agent,
    collectedAt: (o?.collected_at as string) ?? null,
    health: o ? cleanHealth(o.health) : null,
    runner: runnerStatus(vps.length ? vps : hostRows, now),
    jobs: cleanJobs(o?.jobs),
    skills: Array.isArray(o?.skills) ? (o!.skills as string[]) : [],
    usage: {
      today: sumDays(days.filter((d) => d.day === today), "today"),
      week: sumDays(days.filter((d) => d.day >= weekFrom), "7 days"),
      month: sumDays(days, "30 days"),
      days,
    },
    lastTurnAt,
    lastError,
    queued: ((queued ?? []) as Row[]).map((r) => ({ id: r.id as string, jobId: r.job_id as string, action: r.action as JobAction })),
  };
}
