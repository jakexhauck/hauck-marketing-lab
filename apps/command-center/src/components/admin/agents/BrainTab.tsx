import { useMemo, useState } from "react";
import { Maximize2, Minimize2, Pencil, Trash2 } from "lucide-react";
import { AGENTS, type AgentId } from "../../../lib/agents";
import type { AgentLesson } from "../../../lib/agentWire";
import { AGENT_COLORS, graphFor, shortAgentName, type BrainScope, type GraphClient } from "../../../lib/brainGraph";
import BrainGraph from "./BrainGraph";
import { useLessonEdit } from "./agentApi";

const fmtDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

// Scope switch, graph, lesson list. The Manager only ever sees the Mega Brain.
export default function BrainTab({
  tenantId,
  agent,
  clients,
  scope,
  onScope,
  lessons,
  pendingEditIds,
  loading,
  failed,
}: {
  tenantId: string | null;
  agent: AgentId;
  clients: GraphClient[];
  scope: BrainScope;
  onScope: (s: BrainScope) => void;
  lessons: AgentLesson[];
  pendingEditIds: string[];
  loading: boolean;
  failed: boolean;
}) {
  const [big, setBig] = useState(false);
  const graph = useMemo(
    () => graphFor(lessons, clients, AGENTS, scope, { tenantId, agent }),
    [lessons, clients, scope, tenantId, agent],
  );
  const clientName = clients.find((c) => c.id === tenantId)?.name ?? "Client";
  const agentName = shortAgentName(AGENTS.find((a) => a.id === agent)?.name ?? "Agent");
  const scopes: { id: BrainScope; label: string }[] =
    agent === "manager"
      ? [{ id: "mega", label: "Mega Brain" }]
      : [
          { id: "client", label: clientName },
          { id: "agent", label: agentName },
          { id: "mega", label: "Mega Brain" },
        ];

  return (
    <>
      <div className="ag-brain-top">
        <div className="ag-seg">
          {scopes.map((s) => (
            <button key={s.id} type="button" className={scope === s.id ? "on" : ""} onClick={() => onScope(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ag-iconbtn"
          style={{ marginLeft: "auto" }}
          onClick={() => setBig((b) => !b)}
          aria-label={big ? "Shrink graph" : "Expand graph"}
        >
          {big ? <Minimize2 /> : <Maximize2 />}
        </button>
      </div>
      <div className="ag-graph-wrap">
        <BrainGraph nodes={graph.nodes} links={graph.links} height={big ? 560 : 340} />
        <div className="ag-legend">
          <span>
            <i style={{ background: "var(--brand)" }} />
            Client
          </span>
          <span>
            <i style={{ background: AGENT_COLORS.manager }} />
            Agent
          </span>
          <span>
            <i style={{ background: "var(--text-faint)" }} />
            Lesson
          </span>
        </div>
      </div>
      <div className="ag-sec">Lessons</div>
      {loading ? (
        <div className="ag-empty">Loading...</div>
      ) : failed ? (
        <div className="ag-empty">Lessons did not load.</div>
      ) : lessons.length === 0 ? (
        <div className="ag-empty">No lessons</div>
      ) : (
        lessons.map((l) => (
          <LessonRow
            key={l.id}
            lesson={l}
            clientName={clients.find((c) => c.id === l.tenantId)?.name ?? null}
            pending={pendingEditIds.includes(l.id)}
          />
        ))
      )}
    </>
  );
}

function LessonRow({ lesson, clientName, pending }: { lesson: AgentLesson; clientName: string | null; pending: boolean }) {
  const edit = useLessonEdit();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.text);
  // The mutation stays pending until the lessons refetch lands (useLessonEdit
  // returns the invalidate), and from then the mirror's pending list carries
  // it until the PC applies the edit. So "Saving" never flickers off early.
  const saving = pending || edit.isPending;
  const src = [clientName, [lesson.source, fmtDay(lesson.learnedOn)].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="ag-lesson">
      <span className="dt" style={{ background: AGENT_COLORS[lesson.agent] }} />
      <div className="tx">
        {editing ? (
          <div className="ag-change">
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="Lesson" />
            <div className="ag-actions">
              <button
                type="button"
                className="ag-b1"
                disabled={!text.trim() || text.trim() === lesson.text}
                onClick={() => {
                  edit.mutate({ lessonId: lesson.id, action: "edit", text: text.trim() });
                  setEditing(false);
                }}
              >
                Save
              </button>
              <button type="button" className="ag-b2" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {lesson.text}
            {src && <div className="src">{src}</div>}
          </>
        )}
      </div>
      {saving ? (
        <span className="ag-saving">Saving</span>
      ) : (
        !editing && (
          <>
            <button
              type="button"
              className="x"
              aria-label="Edit lesson"
              onClick={() => {
                setText(lesson.text);
                setEditing(true);
              }}
            >
              <Pencil />
            </button>
            <button
              type="button"
              className="x"
              aria-label="Delete lesson"
              onClick={() => edit.mutate({ lessonId: lesson.id, action: "delete" })}
            >
              <Trash2 />
            </button>
          </>
        )
      )}
    </div>
  );
}
