import { Check } from "lucide-react";
import type { BriefSection } from "../../../lib/agentWire";
import { activityFrom } from "../../../lib/briefPages";
import { AGENT_COLORS } from "../../../lib/brainGraph";
import { ownerLabel, type ClientTask, type TaskOwner } from "../../../lib/clientTasks";
import { useClientTaskPatch } from "../../../hooks/useApi";
import { ago, areaGroups, checklistStats } from "./missionHelpers";
import { NotesBlock } from "./NotesBlock";

const OWNER_COLORS: Record<TaskOwner, string> = {
  ...(AGENT_COLORS as Record<Exclude<TaskOwner, "client" | "jake">, string>),
  client: "#64748b",
  jake: "#4DBB83",
};

const initials = (o: TaskOwner) => (o === "jake" ? "J" : o === "client" ? "C" : ownerLabel(o).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());

function Avatar({ owner }: { owner: TaskOwner }) {
  return (
    <span className="mcb-av" style={{ background: OWNER_COLORS[owner] ?? "#64748b" }}>
      {initials(owner)}
    </span>
  );
}

const asOwner = (who: string): TaskOwner | null => {
  const w = who.replace(/^agent:/, "");
  return w === "jake" || w === "client" || w in OWNER_COLORS ? (w as TaskOwner) : null;
};

const whoName = (o: TaskOwner) => (o === "jake" ? "You" : ownerLabel(o));

export function ChecklistPage({
  tenantId,
  tasks,
  loading,
  launchDate,
  sections,
}: {
  tenantId: string;
  tasks: ClientTask[];
  loading: boolean;
  launchDate: string;
  sections: BriefSection[];
}) {
  const patch = useClientTaskPatch(tenantId);
  const groups = areaGroups(tasks);
  const stats = checklistStats(tasks);
  const feed = activityFrom(tasks);
  const toggle = (t: ClientTask) => patch.mutate({ id: t.id, patch: { state: t.state === "done" ? "todo" : "done" } });

  return (
    <div className="mcb-page">
      <div className="mcb-stats">
        <div className="mcb-card mcb-stat">
          <span>Done</span>
          <b>
            {stats.done} / {stats.total}
          </b>
        </div>
        <div className="mcb-card mcb-stat">
          <span>Agents working</span>
          <b>{stats.agentsWorking}</b>
        </div>
        <div className="mcb-card mcb-stat">
          <span>Waiting on you</span>
          <b>{stats.waitingOnJake}</b>
        </div>
        <div className="mcb-card mcb-stat">
          <span>Launch date</span>
          <b>{launchDate || "Not set"}</b>
        </div>
      </div>

      <div className="mcb-setup">
        <div className="mcb-card">
          {loading && <div className="mcb-empty">Loading...</div>}
          {!loading && !groups.length && <div className="mcb-empty">No setup tasks yet</div>}
          {groups.map((g) => (
            <div key={g.area} className="mcb-area">
              <div className="mcb-area-h">
                <b>{g.label}</b>
                <div className="mcb-bar">
                  <div style={{ width: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%` }} />
                </div>
                <span className={`mcb-tag${g.done === g.total ? " ok" : ""}`}>
                  {g.done} / {g.total}
                </span>
              </div>
              {g.tasks.map((t) => {
                const done = t.state === "done";
                const mine = t.owner === "jake" && !done;
                return (
                  <div key={t.id} className={`mcb-task${done ? " done" : ""}`}>
                    <button
                      type="button"
                      className={`mcb-box${done ? " on" : t.state === "doing" ? " doing" : ""}`}
                      onClick={() => toggle(t)}
                      aria-label={done ? `Untick ${t.name}` : `Tick ${t.name}`}
                      aria-pressed={done}
                    >
                      {done && <Check />}
                    </button>
                    <span className="t">{t.name}</span>
                    <span className="mcb-owner">
                      <Avatar owner={t.owner} />
                      <span className="nm">{whoName(t.owner)}</span>
                    </span>
                    {t.state === "doing" ? (
                      <span className="mcb-tag">Working</span>
                    ) : mine ? (
                      <span className="mcb-tag wait">Your move</span>
                    ) : (
                      <span className="mcb-when">{done ? ago(t.doneAt) : ""}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mcb-card mcb-feed">
          <h3 className="mcb-h" style={{ fontSize: 14.5 }}>
            <span className="mcb-live" />
            Activity
          </h3>
          {!feed.length && <div className="mcb-empty">Nothing yet</div>}
          {feed.map((e) => {
            const o = asOwner(e.who);
            return (
              <div key={`${e.key}-${e.what}`} className="mcb-ev">
                {o ? <Avatar owner={o} /> : <span className="mcb-av" style={{ background: "#64748b" }}>?</span>}
                <div>
                  {e.what === "done" ? "Ticked" : "Working on"} {e.name}
                  <small>
                    {o ? whoName(o) : e.who}
                    {e.at ? ` · ${ago(e.at)}` : ""}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NotesBlock tenantId={tenantId} sections={sections} ids={["csm", "onboarding-call", "launch-call"]} />
    </div>
  );
}
