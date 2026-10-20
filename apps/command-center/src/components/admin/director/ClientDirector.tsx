import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useClientTaskCreate, useClientTaskDelete, useClientTaskPatch, useClientTasksQuery } from "../../../hooks/useApi";
import { ownerLabel, TASK_OWNERS, taskPhases, type ClientTask, type TaskOwner, type TaskState } from "../../../lib/clientTasks";
import { blurSave, directorBoard } from "../../../lib/directorBoard";

// The per-client Director (Jake, 2026-10-20; docs/build-plans/client-fulfillment-and-director.md).
// Owners down the side, Client Fulfillment phases across the top, each task a
// card. Jake ticks, unticks, renames, re-owns, moves and deletes here; agents
// move only their own tasks, and only forward, from their chats. A cut task
// stays on the board, faded, with the reason the Manager gave.

const STATE_LABEL: Record<TaskState, string> = { todo: "To do", doing: "Doing", done: "Done", cut: "Cut" };
const STATES: TaskState[] = ["todo", "doing", "done", "cut"];

const who = (by: string | null) => {
  if (!by) return null;
  if (by.startsWith("agent:")) return ownerLabel(by.slice(6) as TaskOwner);
  // Jake's own ticks carry "jake" or, from the old checklist, his admin id.
  return "Jake";
};

export default function ClientDirector({ tenantId }: { tenantId: string }) {
  const q = useClientTasksQuery(tenantId);
  const board = useMemo(() => directorBoard(q.data?.tasks ?? []), [q.data]);
  const [open, setOpen] = useState<string | "new" | null>(null);
  const task = open && open !== "new" ? q.data?.tasks.find((t) => t.id === open) ?? null : null;

  return (
    <div className="dir">
      <DirectorStyle />
      <div className="dir-head">
        <h2 className="dir-title">Director</h2>
        <span className="dir-grow" />
        <button type="button" className="dir-btn" onClick={() => setOpen("new")}>
          <Plus size={15} /> Task
        </button>
      </div>
      {q.isLoading ? (
        <div className="dir-note">Loading...</div>
      ) : q.isLoadingError ? (
        <div className="dir-note">Tasks did not load.</div>
      ) : (
        <div className="dir-scroll">
          <div className="dir-grid" style={{ gridTemplateColumns: `150px repeat(${board.phases.length}, minmax(170px, 1fr))` }}>
            <div className="dir-corner" />
            {board.phases.map((p) => (
              <div key={p.id} className="dir-phase">
                {p.name}
              </div>
            ))}
            {board.rows.map((r) => (
              <Row key={r.owner} label={r.label} done={r.done} total={r.total} cells={r.cells} onOpen={setOpen} />
            ))}
          </div>
        </div>
      )}
      {open === "new" && <NewPanel tenantId={tenantId} onClose={() => setOpen(null)} />}
      {task && <TaskPanel key={task.id} tenantId={tenantId} task={task} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Row({ label, done, total, cells, onOpen }: { label: string; done: number; total: number; cells: ClientTask[][]; onOpen: (id: string) => void }) {
  return (
    <>
      <div className="dir-owner">
        <b>{label}</b>
        <span>
          {done}/{total}
        </span>
      </div>
      {cells.map((list, i) => (
        <div key={i} className="dir-cell">
          {list.map((t) => (
            <button key={t.id} type="button" className={`dir-card s-${t.state}`} onClick={() => onOpen(t.id)}>
              <span className="dir-name">{t.name}</span>
              <span className="dir-meta">
                <span className={`dir-chip s-${t.state}`}>{STATE_LABEL[t.state]}</span>
                {t.change !== "kept" && <span className="dir-mark">{t.change === "added" ? "Added" : "Changed"}</span>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function PhaseSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="dir-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Phase">
      {taskPhases().map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function OwnerSelect({ value, onChange }: { value: TaskOwner; onChange: (v: TaskOwner) => void }) {
  return (
    <select className="dir-input" value={value} onChange={(e) => onChange(e.target.value as TaskOwner)} aria-label="Owner">
      {TASK_OWNERS.map((o) => (
        <option key={o} value={o}>
          {ownerLabel(o)}
        </option>
      ))}
    </select>
  );
}

function TaskPanel({ tenantId, task, onClose }: { tenantId: string; task: ClientTask; onClose: () => void }) {
  const patch = useClientTaskPatch(tenantId);
  const del = useClientTaskDelete(tenantId);
  const [name, setName] = useState(task.name);
  const [note, setNote] = useState(task.note ?? "");
  const [confirming, setConfirming] = useState(false);
  // The text each field held when Jake focused it, or null while unfocused.
  const focusName = useRef<string | null>(null);
  const focusNote = useRef<string | null>(null);
  // An agent's note or a Manager rename lands while the panel is open: show
  // it, unless Jake is typing in that field.
  useEffect(() => {
    if (focusName.current === null) setName(task.name);
  }, [task.name]);
  useEffect(() => {
    if (focusNote.current === null) setNote(task.note ?? "");
  }, [task.note]);
  const save = (p: Parameters<typeof patch.mutate>[0]["patch"]) => patch.mutate({ id: task.id, patch: p });
  const phase = taskPhases().find((p) => p.id === task.sourceNode)?.name;

  return (
    <aside className="dir-panel" aria-label="Task">
      <div className="dir-ph">
        <span className={`dir-chip s-${task.state}`}>{STATE_LABEL[task.state]}</span>
        <button type="button" className="dir-x" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <input
        className="dir-input dir-big"
        value={name}
        maxLength={120}
        aria-label="Name"
        onChange={(e) => setName(e.target.value)}
        onFocus={() => (focusName.current = name)}
        onBlur={() => {
          const v = blurSave(name, focusName.current ?? name);
          focusName.current = null;
          if (v) save({ name: v });
        }}
      />
      {patch.isError && <div className="dir-err">Not saved: {(patch.error as Error).message}</div>}
      <div className="dir-states">
        {STATES.map((s) => (
          <button key={s} type="button" className={`dir-state${task.state === s ? " on" : ""}`} onClick={() => task.state !== s && save({ state: s })}>
            {STATE_LABEL[s]}
          </button>
        ))}
      </div>
      <label className="dir-field">
        <span>Owner</span>
        <OwnerSelect value={task.owner} onChange={(owner) => save({ owner })} />
      </label>
      <label className="dir-field">
        <span>Phase</span>
        <PhaseSelect value={task.phase} onChange={(p) => save({ phase: p })} />
      </label>
      {task.reason && (
        <div className="dir-field">
          <span>Reason</span>
          <p>{task.reason}</p>
        </div>
      )}
      {task.evidence && (
        <div className="dir-field">
          <span>Evidence</span>
          <p>{task.evidence}</p>
        </div>
      )}
      <label className="dir-field">
        <span>Note</span>
        <textarea
          className="dir-input"
          rows={3}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          onFocus={() => (focusNote.current = note)}
          onBlur={() => {
            const v = blurSave(note, focusNote.current ?? note);
            focusNote.current = null;
            if (v !== null) save({ note: v || null });
          }}
        />
      </label>
      {task.doneBy && task.doneAt && (
        <div className="dir-field">
          <span>Done</span>
          <p>
            {who(task.doneBy)}, {new Date(task.doneAt).toLocaleDateString()}
          </p>
        </div>
      )}
      {phase && (
        <div className="dir-field">
          <span>SOP</span>
          <p>Client Fulfillment, {phase}</p>
        </div>
      )}
      {/* Deleting cannot be undone, so it takes a second click. */}
      <button
        type="button"
        className="dir-btn dir-danger"
        disabled={del.isPending}
        onClick={() => (confirming ? del.mutate(task.id, { onSuccess: onClose }) : setConfirming(true))}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? "Delete for good" : "Delete"}
      </button>
      {del.isError && <div className="dir-err">Not deleted: {(del.error as Error).message}</div>}
    </aside>
  );
}

function NewPanel({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const create = useClientTaskCreate(tenantId);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<TaskOwner>("jake");
  const [phase, setPhase] = useState(taskPhases()[0]?.id ?? "");
  return (
    <aside className="dir-panel" aria-label="New task">
      <div className="dir-ph">
        <b>New task</b>
        <button type="button" className="dir-x" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <input className="dir-input dir-big" value={name} maxLength={120} placeholder="Name" aria-label="Name" onChange={(e) => setName(e.target.value)} />
      <label className="dir-field">
        <span>Owner</span>
        <OwnerSelect value={owner} onChange={setOwner} />
      </label>
      <label className="dir-field">
        <span>Phase</span>
        <PhaseSelect value={phase} onChange={setPhase} />
      </label>
      {create.isError && <div className="dir-err">{(create.error as Error).message}</div>}
      <button
        type="button"
        className="dir-btn"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate({ name: name.trim(), owner, phase }, { onSuccess: onClose })}
      >
        Add
      </button>
    </aside>
  );
}

function DirectorStyle() {
  return (
    <style>{`
      .dir { display: flex; flex-direction: column; gap: 14px; min-height: 0; flex: 1; padding: 16px; position: relative; }
      .dir-head { display: flex; align-items: center; gap: 10px; }
      .dir-title { font-size: 20px; font-weight: 600; color: var(--text); }
      .dir-grow { flex: 1; }
      .dir-note { color: var(--text-muted); font-size: 13px; }
      .dir-err { color: var(--danger, #dc2626); font-size: 12.5px; }
      .dir-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 500; }
      .dir-btn:hover { border-color: color-mix(in srgb, var(--brand) 50%, var(--border)); }
      .dir-btn:disabled { opacity: .5; }
      .dir-danger { color: var(--danger, #dc2626); align-self: flex-start; margin-top: 8px; }
      .dir-scroll { overflow: auto; min-height: 0; flex: 1; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
      .dir-grid { display: grid; min-width: max-content; }
      .dir-corner, .dir-phase { position: sticky; top: 0; z-index: 2; background: var(--surface); border-bottom: 1px solid var(--border); }
      .dir-corner { left: 0; z-index: 3; }
      .dir-phase { padding: 10px 10px; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); }
      .dir-owner { position: sticky; left: 0; z-index: 1; background: var(--surface); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
      .dir-owner b { font-size: 13.5px; color: var(--text); font-weight: 600; }
      .dir-owner span { font-size: 12px; color: var(--text-muted); }
      .dir-cell { border-bottom: 1px solid var(--border); padding: 6px; display: flex; flex-direction: column; gap: 6px; min-height: 52px; }
      .dir-card { text-align: left; border: 1px solid var(--border); background: var(--bg, var(--surface)); border-radius: 10px; padding: 8px 9px; display: flex; flex-direction: column; gap: 6px; transition: border-color .15s; }
      .dir-card:hover { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); }
      .dir-card.s-done .dir-name { color: var(--text-muted); text-decoration: line-through; }
      .dir-card.s-cut { opacity: .45; border-style: dashed; }
      .dir-name { font-size: 12.5px; line-height: 1.35; color: var(--text); }
      .dir-meta { display: flex; gap: 6px; align-items: center; }
      .dir-chip { font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 1px 7px; background: color-mix(in srgb, var(--text-muted) 14%, transparent); color: var(--text-muted); }
      .dir-chip.s-doing { background: color-mix(in srgb, #d97706 16%, transparent); color: #d97706; }
      .dir-chip.s-done { background: color-mix(in srgb, #16a34a 16%, transparent); color: #16a34a; }
      .dir-mark { font-size: 10.5px; color: var(--brand); font-weight: 600; }
      .dir-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(380px, 100vw); z-index: 40; background: var(--surface); border-left: 1px solid var(--border); box-shadow: -12px 0 32px rgba(0,0,0,.18); padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
      .dir-ph { display: flex; align-items: center; justify-content: space-between; color: var(--text); }
      .dir-x { color: var(--text-muted); padding: 4px; border-radius: 8px; }
      .dir-input { width: 100%; border: 1px solid var(--border); background: var(--bg, var(--surface)); color: var(--text); border-radius: 10px; padding: 8px 10px; font-size: 13px; outline: none; }
      .dir-input:focus { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); }
      .dir-big { font-size: 15px; font-weight: 600; }
      .dir-states { display: flex; gap: 6px; flex-wrap: wrap; }
      .dir-state { border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; font-size: 12.5px; color: var(--text-muted); }
      .dir-state.on { border-color: transparent; background: var(--brand); color: #fff; }
      .dir-field { display: flex; flex-direction: column; gap: 4px; }
      .dir-field > span { font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); }
      .dir-field p { font-size: 13px; color: var(--text); white-space: pre-wrap; }
    `}</style>
  );
}
