import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useClientTaskCreate, useClientTaskDelete, useClientTaskPatch, useClientTasksQuery } from "../../../hooks/useApi";
import { ownerLabel, TASK_OWNERS, taskPhases, type ClientTask, type TaskOwner, type TaskState } from "../../../lib/clientTasks";
import { blurSave, cellSummary, directorBoard } from "../../../lib/directorBoard";

// The per-client Director (Jake, 2026-10-20; docs/build-plans/client-fulfillment-and-director.md).
// Owners down the side, Client Fulfillment phases across the top. Every task
// fits on one screen (Jake, 2026-10-21): a cell is a dot per task and a count,
// and clicking it lists its tasks in the side panel. Jake ticks, unticks,
// renames, re-owns, moves and deletes from there; agents move only their own
// tasks, and only forward, from their chats. A cut task stays, as a hollow dot.

const STATE_LABEL: Record<TaskState, string> = { todo: "To do", doing: "Doing", done: "Done", cut: "Cut" };
const STATES: TaskState[] = ["todo", "doing", "done", "cut"];

const who = (by: string | null) => {
  if (!by) return null;
  if (by.startsWith("agent:")) return ownerLabel(by.slice(6) as TaskOwner);
  // Jake's own ticks carry "jake" or, from the old checklist, his admin id.
  return "Jake";
};

type Cell = { owner: TaskOwner; phase: string };
type Open = { kind: "new" } | ({ kind: "cell" } & Cell) | { kind: "task"; id: string; from: Cell | null } | null;

export default function ClientDirector({ tenantId }: { tenantId: string }) {
  const q = useClientTasksQuery(tenantId);
  const tasks = useMemo(() => q.data?.tasks ?? [], [q.data]);
  const board = useMemo(() => directorBoard(tasks), [tasks]);
  const [open, setOpen] = useState<Open>(null);
  const task = open?.kind === "task" ? tasks.find((t) => t.id === open.id) ?? null : null;

  return (
    <div className="dir">
      <DirectorStyle />
      <div className="dir-head">
        <h2 className="dir-title">Director</h2>
        <span className="dir-grow" />
        <button type="button" className="dir-btn" onClick={() => setOpen({ kind: "new" })}>
          <Plus size={15} /> Task
        </button>
      </div>
      {q.isLoading ? (
        <div className="dir-note">Loading...</div>
      ) : q.isLoadingError ? (
        <div className="dir-note">Tasks did not load.</div>
      ) : (
        <div className="dir-board">
          <div className="dir-grid" style={{ gridTemplateColumns: `minmax(96px, 130px) repeat(${board.phases.length}, minmax(0, 1fr))` }}>
            <div className="dir-corner" />
            {board.phases.map((p) => (
              <div key={p.id} className="dir-phase" title={p.name}>
                {p.name}
              </div>
            ))}
            {board.rows.map((r) => (
              <Fragment key={r.owner}>
                <div className="dir-owner">
                  <b>{r.label}</b>
                  <span>
                    {r.done}/{r.total}
                  </span>
                </div>
                {r.cells.map((list, i) => {
                  const phase = board.phases[i].id;
                  const s = cellSummary(list);
                  const on = open?.kind === "cell" && open.owner === r.owner && open.phase === phase;
                  return (
                    <div key={phase} className="dir-cell">
                      {s.dots.length > 0 && (
                        <button
                          type="button"
                          className={`dir-sum${on ? " on" : ""}`}
                          aria-label={`${r.label}, ${board.phases[i].name}: ${s.done} of ${s.total} done`}
                          onClick={() => setOpen({ kind: "cell", owner: r.owner, phase })}
                        >
                          <span className="dir-dots">
                            {s.dots.map((t) => (
                              <i key={t.id} className={`dir-dot s-${t.state}`} title={t.name} />
                            ))}
                          </span>
                          <span className="dir-count">
                            {s.done}/{s.total}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {open?.kind === "new" && <NewPanel tenantId={tenantId} onClose={() => setOpen(null)} />}
      {open?.kind === "cell" && (
        <CellPanel
          tasks={tasks.filter((t) => t.owner === open.owner && t.phase === open.phase).sort((x, y) => x.position - y.position || x.name.localeCompare(y.name))}
          title={`${ownerLabel(open.owner)} · ${board.phases.find((p) => p.id === open.phase)?.name ?? open.phase}`}
          onPick={(id) => setOpen({ kind: "task", id, from: { owner: open.owner, phase: open.phase } })}
          onClose={() => setOpen(null)}
        />
      )}
      {task && open?.kind === "task" && (
        <TaskPanel key={task.id} tenantId={tenantId} task={task} onClose={() => setOpen(open.from ? { kind: "cell", ...open.from } : null)} />
      )}
    </div>
  );
}

function CellPanel({ title, tasks, onPick, onClose }: { title: string; tasks: ClientTask[]; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <aside className="dir-panel" aria-label={title}>
      <div className="dir-ph">
        <b>{title}</b>
        <button type="button" className="dir-x" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="dir-rows">
        {tasks.map((t) => (
          <button key={t.id} type="button" className={`dir-row s-${t.state}`} onClick={() => onPick(t.id)}>
            <i className={`dir-dot s-${t.state}`} />
            <span className="dir-name">{t.name}</span>
            <span className={`dir-chip s-${t.state}`}>{STATE_LABEL[t.state]}</span>
          </button>
        ))}
      </div>
    </aside>
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
      .dir-board { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); overflow: hidden; }
      .dir-grid { display: grid; width: 100%; }
      .dir-corner, .dir-phase { border-bottom: 1px solid var(--border); }
      .dir-phase { padding: 9px 8px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dir-owner { border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; gap: 1px; min-width: 0; }
      .dir-owner b { font-size: 13px; color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dir-owner span { font-size: 11.5px; color: var(--text-muted); }
      .dir-cell { border-bottom: 1px solid var(--border); padding: 5px; min-width: 0; display: flex; }
      .dir-sum { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; align-items: flex-start; text-align: left; border: 1px solid transparent; border-radius: 9px; padding: 6px 7px; transition: border-color .15s, background-color .15s; }
      .dir-sum:hover, .dir-sum.on { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); background: color-mix(in srgb, var(--brand) 6%, transparent); }
      .dir-dots { display: flex; flex-wrap: wrap; gap: 4px; }
      .dir-dot { width: 9px; height: 9px; border-radius: 999px; background: color-mix(in srgb, var(--text-muted) 35%, transparent); display: inline-block; flex: none; }
      .dir-dot.s-doing { background: #d97706; }
      .dir-dot.s-done { background: #16a34a; }
      .dir-dot.s-cut { background: transparent; border: 1.5px dashed color-mix(in srgb, var(--text-muted) 60%, transparent); }
      .dir-count { font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
      .dir-rows { display: flex; flex-direction: column; gap: 4px; }
      .dir-row { display: flex; align-items: center; gap: 8px; text-align: left; border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; }
      .dir-row:hover { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); }
      .dir-row .dir-name { flex: 1; min-width: 0; }
      .dir-row.s-done .dir-name { color: var(--text-muted); text-decoration: line-through; }
      .dir-row.s-cut { opacity: .5; border-style: dashed; }
      .dir-name { font-size: 12.5px; line-height: 1.35; color: var(--text); }
      .dir-chip { font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 1px 7px; background: color-mix(in srgb, var(--text-muted) 14%, transparent); color: var(--text-muted); white-space: nowrap; }
      .dir-chip.s-doing { background: color-mix(in srgb, #d97706 16%, transparent); color: #d97706; }
      .dir-chip.s-done { background: color-mix(in srgb, #16a34a 16%, transparent); color: #16a34a; }
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
