import type { AgentId } from "../../../lib/agents";
import type {
  AgentJob,
  AgentUsageDay,
  JobAction,
} from "../../../lib/agentWire";
import { useAgentOps, useJobAction } from "./agentApi";

// One agent's Settings tab (docs/build-plans/hermes-agent-ops.md, Phase 4):
// health, cost, skills and scheduled jobs, as the VPS runner last read them
// from Hermes. Memory is the Brain tab beside it. Labels only, no blurbs
// (Jake's rule): the numbers and pills carry it.

const money = (n: number) =>
  n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`;

const tokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}k`
      : String(n);

const all = (u: AgentUsageDay) =>
  u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default function AgentSettings({ agent }: { agent: AgentId }) {
  const q = useAgentOps(agent);
  const job = useJobAction(agent);

  if (q.isLoading) return <div className="ag-empty">Loading...</div>;
  if (q.isLoadingError || !q.data)
    return <div className="ag-empty">Settings did not load.</div>;
  const v = q.data;
  const healthy = v.health?.status === "ok" && v.runner.online;
  const pending = (j: AgentJob) => v.queued.find((c) => c.jobId === j.id);
  const act = (jobId: string, action: JobAction) =>
    job.mutate({ jobId, action });

  return (
    <>
      <div className="ag-sec">Health</div>
      <div className="ag-card">
        <div className="ag-card-top">
          <div className="ag-card-t">
            {healthy ? "Working" : v.health ? "Needs a look" : "Not read yet"}
          </div>
          <span className={`ag-pill ${healthy ? "ag-p-live" : "ag-p-bad"}`}>
            {healthy ? "Online" : "Offline"}
          </span>
        </div>
        <div className="ag-list">
          <div>
            Hermes:{" "}
            {v.health
              ? `${v.health.status}${v.health.gateway ? `, gateway ${v.health.gateway}` : ""}`
              : "no read"}
          </div>
          <div>
            Runner:{" "}
            {v.runner.online
              ? "online"
              : `last seen ${ago(v.runner.lastSeenAt)}`}
          </div>
          <div>Last turn: {ago(v.lastTurnAt)}</div>
          {v.lastError && (
            <div className="ag-err">
              Last error {ago(v.lastError.at)}: {v.lastError.error}
            </div>
          )}
          {v.health?.error && <div className="ag-err">{v.health.error}</div>}
        </div>
        <div className="ag-meta-row">
          <span>Read {ago(v.collectedAt)}</span>
        </div>
      </div>

      <div className="ag-sec">Cost</div>
      <div className="ag-card">
        <div className="ag-stats">
          {[v.usage.today, v.usage.week, v.usage.month].map((u) => (
            <div key={u.day} className="ag-stat">
              <div className="v">{money(u.estCostUsd)}</div>
              <div className="l">
                {u.day === "today"
                  ? "Today"
                  : u.day === "7 days"
                    ? "7 days"
                    : "30 days"}
              </div>
            </div>
          ))}
        </div>
        <div className="ag-stats">
          <div className="ag-stat">
            <div className="v">{v.usage.month.sessions}</div>
            <div className="l">Chats</div>
          </div>
          <div className="ag-stat">
            <div className="v">{v.usage.month.apiCalls}</div>
            <div className="l">Model calls</div>
          </div>
          <div className="ag-stat">
            <div className="v">{tokens(all(v.usage.month))}</div>
            <div className="l">Tokens</div>
          </div>
        </div>
        <div className="ag-meta-row">
          <span>API price estimate</span>
          <span>Claude subscription</span>
        </div>
      </div>

      <div className="ag-sec">Skills</div>
      <div className="ag-card">
        {v.skills.length ? (
          <div className="ag-skills">
            {v.skills.map((s) => (
              <span key={s} className="ag-skill">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <div className="ag-empty">None</div>
        )}
      </div>

      <div className="ag-sec">Schedules</div>
      {v.jobs.length === 0 ? (
        <div className="ag-empty">No scheduled jobs</div>
      ) : (
        v.jobs.map((j) => {
          const waiting = pending(j);
          return (
            <div key={j.id} className="ag-card">
              <div className="ag-card-top">
                <div className="ag-card-t">{j.name}</div>
                <span
                  className={`ag-pill ${j.enabled ? "ag-p-live" : "ag-p-ok"}`}
                >
                  {j.enabled ? "On" : "Paused"}
                </span>
              </div>
              <div className="ag-list">
                {j.schedule && <div>{j.schedule}</div>}
                <div>
                  Next{" "}
                  {j.nextRunAt
                    ? new Date(j.nextRunAt).toLocaleString()
                    : "not set"}
                  , last {j.lastRunAt ? ago(j.lastRunAt) : "never"}
                  {j.lastStatus ? ` (${j.lastStatus})` : ""}
                </div>
              </div>
              {waiting ? (
                <div className="ag-meta-row">
                  <span>
                    {waiting.action === "run"
                      ? "Run"
                      : waiting.action === "pause"
                        ? "Pause"
                        : "Resume"}{" "}
                    queued
                  </span>
                </div>
              ) : (
                <div className="ag-actions">
                  <button
                    type="button"
                    className="ag-b2"
                    disabled={job.isPending}
                    onClick={() => act(j.id, j.enabled ? "pause" : "resume")}
                  >
                    {j.enabled ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="ag-b1"
                    disabled={job.isPending}
                    onClick={() => act(j.id, "run")}
                  >
                    Run now
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
