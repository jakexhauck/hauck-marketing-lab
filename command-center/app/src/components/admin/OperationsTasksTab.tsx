import { useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useAdminTaskList, type TaskTextField } from "../../hooks/useAdminTaskList";
import { taskCounts, type TaskStatus } from "../../lib/taskStatus";
import type { AdminTask } from "../../lib/api";

// The Operations pillar's Tasks tab: one flat, editable agency checklist.
// Ported from command-center/docs/mockups/admin-redesign/task-list-A.html.
//
// The kicker, title, tagline and the pillar tab bar come from PillarPage, so
// this renders only the controls row and the table card. Every cell writes
// through useAdminTaskList (optimistic); the Done checkbox and the status pill
// are two views of one fact and stay coupled via lib/taskStatus.
//
// Nothing here fabricates data: an empty list says so, and a failed load shows
// the error rather than a stub row.

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

export default function OperationsTasksTab() {
  const { tasks, loading, error, adding, addTask, patchField, setStatus, toggleDone, deleteTask } =
    useAdminTaskList();
  // Uncommitted keystrokes per row, keyed by task id then field. Cleared on
  // blur once the write is away, so the row falls back to the stored value.
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<TaskTextField, string>>>>({});
  // The row whose Task cell should take focus (the row just added).
  const [focusId, setFocusId] = useState<string | null>(null);

  const counts = taskCounts(tasks);

  const draftValue = (task: AdminTask, field: TaskTextField) =>
    drafts[task.id]?.[field] ?? task[field] ?? "";

  const onCellChange = (task: AdminTask, field: TaskTextField, value: string) => {
    setDrafts((d) => ({ ...d, [task.id]: { ...d[task.id], [field]: value } }));
  };

  const onCellBlur = (task: AdminTask, field: TaskTextField, value: string) => {
    setDrafts((d) => {
      const row = { ...d[task.id] };
      delete row[field];
      return { ...d, [task.id]: row };
    });
    void patchField(task, field, value);
  };

  const onAdd = async () => {
    const id = await addTask();
    if (id) setFocusId(id);
  };

  const onDelete = (task: AdminTask) => {
    const label = task.title?.trim() || "this task";
    if (!window.confirm(`Remove ${label}?`)) return;
    void deleteTask(task);
  };

  return (
    <div className="otk">
      <OperationsTasksStyle />

      <div className="otk-controls">
        <button type="button" className="otk-add" onClick={() => void onAdd()} disabled={adding}>
          <Plus size={16} strokeWidth={2.4} />
          {adding ? "Adding" : "Add task"}
        </button>
      </div>

      <div className="otk-card">
        <div className="otk-head">
          <div>
            <div className="otk-cardtitle">Today's Checklist</div>
            <div className="otk-sub">
              {counts.open} open, {counts.done} done
            </div>
          </div>
          <div className="otk-legend">
            <b>
              <span className="otk-dot todo" />
              To do
            </b>
            <b>
              <span className="otk-dot doing" />
              Doing
            </b>
            <b>
              <span className="otk-dot done" />
              Done
            </b>
          </div>
        </div>

        {error ? (
          <div className="otk-state">{error}</div>
        ) : loading ? (
          <div className="otk-state">Loading tasks</div>
        ) : tasks.length === 0 ? (
          <div className="otk-state">No tasks yet. Add one to start the checklist.</div>
        ) : (
          <div className="otk-scroll">
            <table>
              <thead>
                <tr>
                  <th>Done</th>
                  <th>Task</th>
                  <th>Notes / Files</th>
                  <th>Status</th>
                  <th>Updates</th>
                  <th className="otk-delhead" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className={task.completed ? "otk-rowdone" : undefined}>
                    <td className="otk-donecol">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={task.completed}
                        aria-label={`Done: ${task.title || "untitled task"}`}
                        className={`otk-chk${task.completed ? " on" : ""}`}
                        onClick={() => void toggleDone(task)}
                      >
                        <Check size={13} strokeWidth={3.4} />
                      </button>
                    </td>
                    <td className="otk-taskcol">
                      <input
                        className="otk-txt"
                        value={draftValue(task, "title")}
                        placeholder="New task"
                        aria-label="Task"
                        ref={(el) => {
                          if (el && focusId === task.id) {
                            el.focus();
                            setFocusId(null);
                          }
                        }}
                        onChange={(e) => onCellChange(task, "title", e.target.value)}
                        onBlur={(e) => onCellBlur(task, "title", e.target.value)}
                      />
                    </td>
                    <td className="otk-notescol">
                      <input
                        className="otk-txt"
                        value={draftValue(task, "note")}
                        placeholder="Notes"
                        aria-label="Notes"
                        onChange={(e) => onCellChange(task, "note", e.target.value)}
                        onBlur={(e) => onCellBlur(task, "note", e.target.value)}
                      />
                    </td>
                    <td className="otk-statuscol">
                      <span className="otk-pill">
                        <select
                          className={`otk-status ${task.status}`}
                          value={task.status}
                          aria-label="Status"
                          onChange={(e) => void setStatus(task, e.target.value as TaskStatus)}
                        >
                          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="otk-caret" size={13} strokeWidth={2.4} />
                      </span>
                    </td>
                    <td className="otk-updcol">
                      <input
                        className="otk-txt"
                        value={draftValue(task, "updates")}
                        placeholder="Add an update"
                        aria-label="Updates"
                        onChange={(e) => onCellChange(task, "updates", e.target.value)}
                        onBlur={(e) => onCellBlur(task, "updates", e.target.value)}
                      />
                    </td>
                    <td className="otk-delcol">
                      <button
                        type="button"
                        className="otk-del"
                        aria-label={`Remove ${task.title?.trim() || "untitled task"}`}
                        title="Remove task"
                        onClick={() => onDelete(task)}
                      >
                        <X size={15} strokeWidth={2.4} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Bento Bold styles, ported from the task-list-A mockup and scoped to
// .pk-kit .otk so they read the admin theme tokens, work in light and dark, and
// cannot collide with the other admin surfaces. The three status tints carry
// their own vars since the mockup palette is light-only.
function OperationsTasksStyle() {
  return (
    <style>{`
      .pk-kit .otk {
        --otk-indigo: #6366f1;
        --otk-green: #10b981; --otk-green-tint: #e7f7f0; --otk-green-ink: #0a7d58;
        --otk-sky: #0ea5e9;   --otk-sky-tint: #e6f5fd;   --otk-sky-ink: #0a7bb3;
        --otk-amber: #f59e0b; --otk-amber-tint: #fdf3e2; --otk-amber-ink: #b57608;
        --otk-head-bg: #fafbfc; --otk-hover: #fbfbfd; --otk-input-hover: #f1f2f6;
      }
      [data-theme="dark"] .pk-kit .otk {
        --otk-green-tint: rgba(16,185,129,.15); --otk-green-ink: #34d399;
        --otk-sky-tint: rgba(14,165,233,.15);   --otk-sky-ink: #38bdf8;
        --otk-amber-tint: rgba(245,158,11,.15); --otk-amber-ink: #fbbf24;
        --otk-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --otk-hover: rgba(255,255,255,.03);
        --otk-input-hover: rgba(255,255,255,.06);
      }

      .pk-kit .otk-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .pk-kit .otk-add {
        margin-left: auto; border: 0; background: var(--otk-indigo); color: #fff;
        font: inherit; font-weight: 600; font-size: 13px; padding: 10px 16px;
        border-radius: 12px; cursor: pointer; display: inline-flex; align-items: center;
        gap: 7px; box-shadow: 0 8px 18px -8px rgba(99,102,241,.8); transition: .15s;
      }
      .pk-kit .otk-add:hover { background: #5457e6; }
      .pk-kit .otk-add:disabled { opacity: .6; cursor: default; }

      .pk-kit .otk-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        margin-top: 16px; display: flex; flex-direction: column;
        box-shadow: var(--shadow-md); overflow: hidden;
      }
      .pk-kit .otk-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; gap: 12px; }
      .pk-kit .otk-cardtitle { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); }
      .pk-kit .otk-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; font-variant-numeric: tabular-nums; }
      .pk-kit .otk-legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--text-faint); align-items: center; }
      .pk-kit .otk-legend b { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; }
      .pk-kit .otk-dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
      .pk-kit .otk-dot.todo { background: var(--otk-amber); }
      .pk-kit .otk-dot.doing { background: var(--otk-sky); }
      .pk-kit .otk-dot.done { background: var(--otk-green); }

      .pk-kit .otk-state { padding: 18px 20px 24px; font-size: 13.5px; color: var(--text-muted); }

      .pk-kit .otk-scroll { overflow: auto; max-height: min(62vh, 720px); }
      .pk-kit .otk-card table { width: 100%; border-collapse: collapse; }
      .pk-kit .otk-card thead th {
        position: sticky; top: 0; z-index: 2; background: var(--otk-head-bg);
        font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: var(--text-faint); text-align: left; padding: 11px 14px; white-space: nowrap;
        border-bottom: 1px solid var(--border);
      }
      .pk-kit .otk-card tbody td {
        padding: 8px 14px; font-size: 13.5px; text-align: left;
        border-bottom: 1px solid var(--border); vertical-align: middle;
      }
      .pk-kit .otk-card tbody tr:hover td { background: var(--otk-hover); }

      .pk-kit .otk-card td.otk-donecol { width: 46px; }
      .pk-kit .otk-chk {
        width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--border);
        background: var(--surface); cursor: pointer; display: grid; place-items: center;
        transition: .14s; padding: 0; color: #fff;
      }
      .pk-kit .otk-chk svg { opacity: 0; transform: scale(.6); transition: .14s; }
      .pk-kit .otk-chk.on { background: var(--otk-green); border-color: var(--otk-green); }
      .pk-kit .otk-chk.on svg { opacity: 1; transform: scale(1); }
      .pk-kit .otk-chk:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--otk-indigo); }

      .pk-kit .otk-card td .otk-txt {
        width: 100%; border: 0; background: transparent; font: inherit; color: var(--text);
        padding: 6px 8px; border-radius: 8px; transition: background .12s, box-shadow .12s;
      }
      .pk-kit .otk-card td.otk-taskcol .otk-txt { font-weight: 600; min-width: 160px; }
      .pk-kit .otk-card td.otk-notescol .otk-txt { color: var(--text-muted); font-weight: 400; min-width: 150px; }
      .pk-kit .otk-card td.otk-updcol .otk-txt { color: var(--text-muted); font-weight: 400; min-width: 130px; }
      .pk-kit .otk-card td .otk-txt::placeholder { color: var(--text-faint); font-weight: 400; }
      .pk-kit .otk-card td .otk-txt:hover { background: var(--otk-input-hover); }
      .pk-kit .otk-card td .otk-txt:focus { outline: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--otk-indigo); position: relative; z-index: 1; }

      .pk-kit .otk-card td.otk-statuscol { width: 130px; }
      .pk-kit .otk-pill { position: relative; display: inline-flex; align-items: center; }
      .pk-kit .otk-status {
        appearance: none; -webkit-appearance: none; border: 0; cursor: pointer; font: inherit;
        font-weight: 600; font-size: 12.5px; padding: 6px 30px 6px 13px; border-radius: 999px; transition: .14s;
      }
      .pk-kit .otk-status:focus { outline: 0; box-shadow: 0 0 0 2px var(--otk-indigo); }
      .pk-kit .otk-status.todo { background: var(--otk-amber-tint); color: var(--otk-amber-ink); }
      .pk-kit .otk-status.doing { background: var(--otk-sky-tint); color: var(--otk-sky-ink); }
      .pk-kit .otk-status.done { background: var(--otk-green-tint); color: var(--otk-green-ink); }
      .pk-kit .otk-pill .otk-caret {
        position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
        pointer-events: none; opacity: .55;
      }

      .pk-kit .otk-card tr.otk-rowdone { opacity: .72; }
      .pk-kit .otk-card tr.otk-rowdone td .otk-txt { color: var(--text-faint); text-decoration: line-through; }

      /* Remove column: an always-visible X on the right of each row. Deletes the
         task (behind a confirm) via useAdminTaskList. */
      .pk-kit .otk-card th.otk-delhead { width: 44px; }
      .pk-kit .otk-card td.otk-delcol { width: 44px; text-align: center; }
      .pk-kit .otk-del {
        display: grid; place-items: center; width: 28px; height: 28px; margin: 0 auto;
        border: 0; border-radius: 8px; background: transparent; color: var(--text-faint);
        cursor: pointer; transition: color .14s, background .14s;
      }
      .pk-kit .otk-del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
      .pk-kit .otk-del:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--danger); }

      @media (max-width: 720px) { .pk-kit .otk-add { margin-left: 0; } }
    `}</style>
  );
}
