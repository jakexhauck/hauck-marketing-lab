// Each agent's settings, read from Hermes (docs/build-plans/hermes-agent-ops.md,
// Phase 4). Every ten minutes the VPS runner asks each profile, with that
// profile's own key, for its sessions (tokens and Hermes's cost estimate),
// its health and its scheduled jobs, and posts them to the app. The app's
// answer carries any pause, resume or run Jake asked for; they are carried out
// here and reported on the next post.
//
// Hermes counts usage per session, and a session grows while its chat goes on,
// so the days are summed fresh from every session each time and the app
// rewrites those days whole. Nothing is added to a running total.

import { readFileSync } from "node:fs";
import type { AgentHealth, AgentId, AgentJob, AgentOpsBody, AgentOpsCommand, AgentOpsReport, AgentUsageDay } from "./wire.ts";

const DAYS = 30;
const TIMEOUT_MS = 20_000;

type Obj = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// Hermes stamps sessions in epoch seconds.
const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

export function usageByDay(sessions: Obj[], now: Date): AgentUsageDay[] {
  const from = new Date(now.getTime() - (DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const days = new Map<string, AgentUsageDay>();
  for (const s of sessions) {
    const started = num(s.started_at);
    if (!started) continue;
    const day = isoDay(started);
    if (day < from) continue;
    const d = days.get(day) ?? { day, sessions: 0, apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estCostUsd: 0 };
    d.sessions += 1;
    d.apiCalls += num(s.api_call_count);
    d.inputTokens += num(s.input_tokens);
    d.outputTokens += num(s.output_tokens);
    d.cacheReadTokens += num(s.cache_read_tokens);
    d.cacheWriteTokens += num(s.cache_write_tokens);
    d.estCostUsd += num(s.actual_cost_usd) || num(s.estimated_cost_usd);
    days.set(day, d);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, estCostUsd: Math.round(d.estCostUsd * 10_000) / 10_000 }));
}

export function healthFrom(h: Obj | null, err: string | null): AgentHealth {
  if (!h) return { status: "unreachable", gateway: null, error: err };
  const platforms = (h.platforms && typeof h.platforms === "object" ? h.platforms : {}) as Record<string, Obj>;
  const api = platforms.api_server ?? {};
  return {
    status: str(h.status) || "unknown",
    gateway: str(h.gateway_state) || null,
    error: str(api.error_message) || null,
  };
}

// Hermes's job list, in the few fields the Settings tab shows. Names differ a
// little across Hermes versions, so each field reads its likely spellings.
export function jobsFrom(raw: unknown): AgentJob[] {
  const list = Array.isArray((raw as Obj)?.jobs) ? ((raw as Obj).jobs as Obj[]) : [];
  return list.map((j) => {
    const when = (v: unknown) => (typeof v === "number" ? new Date(v * 1000).toISOString() : str(v) || null);
    return {
      id: str(j.id ?? j.job_id),
      name: str(j.name ?? j.title) || str(j.prompt).slice(0, 80),
      schedule: str(j.schedule ?? j.cron ?? j.expression),
      enabled: !(j.paused === true || j.enabled === false || j.state === "paused"),
      nextRunAt: when(j.next_run_at ?? j.next_run),
      lastRunAt: when(j.last_run_at ?? j.last_run),
      lastStatus: str(j.last_status ?? j.last_result) || null,
    };
  }).filter((j) => j.id);
}

// The skill folders setup.sh installed for each agent (deploy/vps/skills.json).
export function manifestSkills(file: string): Partial<Record<AgentId, string[]>> {
  try {
    const m = JSON.parse(readFileSync(file, "utf8")) as { install?: Record<string, [string, string][]> };
    return Object.fromEntries(Object.entries(m.install ?? {}).map(([a, rows]) => [a, rows.map(([, path]) => path.split("/").pop() ?? path)]));
  } catch {
    return {};
  }
}

export interface OpsDeps {
  base: string;
  keys: Partial<Record<AgentId, string>>;
  skills: Partial<Record<AgentId, string[]>>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

async function getJson(f: typeof fetch, url: string, key: string): Promise<Obj> {
  const res = await f(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as Obj;
}

export async function readAgent(agent: AgentId, d: OpsDeps): Promise<AgentOpsReport | null> {
  const key = d.keys[agent];
  if (!key) return null;
  const f = d.fetchImpl ?? fetch;
  const p = `${d.base.replace(/\/+$/, "")}/p/${agent}`;
  let health: AgentHealth;
  try {
    health = healthFrom(await getJson(f, `${p}/health/detailed`, key), null);
  } catch (e) {
    // Down: report that alone. Sessions and jobs would only fail the same way.
    return { agent, health: healthFrom(null, `health check failed: ${(e as Error).message}`), jobs: [], skills: d.skills[agent] ?? [], usage: [] };
  }
  const sessions = await getJson(f, `${p}/api/sessions?limit=500`, key).catch(() => ({ data: [] }) as Obj);
  const jobs = await getJson(f, `${p}/api/jobs`, key).catch(() => ({ jobs: [] }) as Obj);
  return {
    agent,
    health,
    jobs: jobsFrom(jobs),
    skills: d.skills[agent] ?? [],
    usage: usageByDay(Array.isArray(sessions.data) ? (sessions.data as Obj[]) : [], (d.now ?? (() => new Date()))()),
  };
}

// Jake's queued pause, resume or run, carried out on the profile's own API.
export async function runCommand(c: AgentOpsCommand, d: OpsDeps): Promise<{ id: string; ok: boolean; result: string }> {
  const key = d.keys[c.agent];
  if (!key) return { id: c.id, ok: false, result: `no Hermes key for ${c.agent}` };
  if (!["pause", "resume", "run"].includes(c.action)) return { id: c.id, ok: false, result: "unknown action" };
  const f = d.fetchImpl ?? fetch;
  try {
    const res = await f(`${d.base.replace(/\/+$/, "")}/p/${c.agent}/api/jobs/${encodeURIComponent(c.jobId)}/${c.action}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = (await res.text()).slice(0, 500);
    return { id: c.id, ok: res.ok, result: res.ok ? `${c.action} done` : `Hermes ${res.status}: ${text}` };
  } catch (e) {
    return { id: c.id, ok: false, result: (e as Error).message };
  }
}

// One round: read every agent, post, run what came back, and report those
// runs straight away (with the agents read again, so a paused job shows paused).
// A report that fails to post is kept and sent with the next round.
export function opsLoop(agents: AgentId[], d: OpsDeps, post: (b: AgentOpsBody) => Promise<{ commands: AgentOpsCommand[] }>) {
  let done: AgentOpsBody["done"] = [];
  const readAll = async () => (await Promise.all(agents.map((a) => readAgent(a, d)))).filter((r): r is AgentOpsReport => !!r);
  return async function round(): Promise<number> {
    const reports = await readAll();
    const { commands } = await post({ agents: reports, done });
    done = [];
    for (const c of commands) done.push(await runCommand(c, d));
    if (done.length) {
      await post({ agents: await readAll(), done });
      done = [];
    }
    return reports.length;
  };
}
