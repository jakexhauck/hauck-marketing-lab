// Tasks tab for a pillar: an editable checklist of the work and constraints to
// fix in this pillar. Add a task, check it off, delete it. Data + mutations come
// from the usePillarTasks hook, owned by the parent AdminPillar (so the tab-count
// badge and this list share one fetch). Presentation only.

import { useState, type FormEvent } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { AdminTask } from "../../../lib/api";
import type { UsePillarTasks } from "../../../hooks/usePillarTasks";

export default function TasksTab({ tasks }: { tasks: UsePillarTasks }) {
  const { tasks: list, loading, error, adding, addTask, toggleTask, deleteTask } = tasks;
  const [title, setTitle] = useState("");

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || adding) return;
    void addTask(trimmed).then(() => setTitle(""));
  };

  return (
    <div>
      <p className="tk-intro">Work and constraints to fix in this pillar.</p>

      <form className="tk-add" onSubmit={onAdd}>
        <input
          className="tk-add-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task..."
          aria-label="New task"
        />
        <button type="submit" className="tk-add-btn" disabled={!title.trim() || adding}>
          {adding ? <Loader2 className="tk-spin" size={15} /> : <Plus size={15} />}
          Add
        </button>
      </form>

      {loading ? (
        <div className="tk-state">
          <Loader2 className="tk-spin" size={15} /> Loading tasks...
        </div>
      ) : error ? (
        <div className="tk-state tk-state-error">{error}</div>
      ) : list.length === 0 ? (
        <div className="pk-needs">
          <span className="pk-needs-dot" aria-hidden />
          Nothing here yet. Add a task above.
        </div>
      ) : (
        <div className="pk-tasks">
          {list.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => void toggleTask(task)}
              onDelete={() => void deleteTask(task)}
            />
          ))}
        </div>
      )}

      <style>{TK_CSS}</style>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: AdminTask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="pk-taskrow tk-row">
      <button
        type="button"
        className={`pk-taskbox tk-check${task.completed ? " done" : ""}`}
        onClick={onToggle}
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? "Mark task open" : "Mark task done"}
      >
        {task.completed && <Check />}
      </button>
      <div className="pk-task-main">
        <div className={`pk-task-title${task.completed ? " tk-done" : ""}`}>{task.title}</div>
        {task.note && <div className="pk-task-note">{task.note}</div>}
      </div>
      <button type="button" className="tk-del" onClick={onDelete} aria-label="Delete task">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

const TK_CSS = `
  .tk-intro { color: var(--text-muted); font-size: 14px; line-height: 1.6; margin: 0 0 16px; }

  .tk-add { display: flex; gap: 10px; margin-bottom: 18px; }
  .tk-add-input {
    flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; color: var(--text); font: inherit; font-size: 14px;
    outline: none; transition: border-color .14s, box-shadow .14s;
  }
  .tk-add-input::placeholder { color: var(--text-faint); }
  .tk-add-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-tint); }
  .tk-add-btn {
    display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
    background: var(--grad-brand); color: var(--brand-fg, #fff); border: 0; border-radius: 10px;
    padding: 0 16px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    box-shadow: var(--shadow-brand); transition: opacity .14s, transform .12s;
  }
  .tk-add-btn:hover:not(:disabled) { transform: translateY(-1px); }
  .tk-add-btn:active:not(:disabled) { transform: translateY(0); }
  .tk-add-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }

  .tk-state { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13.5px; padding: 14px 2px; }
  .tk-state-error { color: var(--danger); }
  .tk-spin { animation: tkspin 1s linear infinite; }
  @keyframes tkspin { to { transform: rotate(360deg); } }

  /* The checkbox is the existing pk-taskbox, made interactive. */
  .tk-check { padding: 0; background: transparent; cursor: pointer; transition: border-color .14s, background .14s; }
  .tk-check:hover { border-color: var(--brand); }
  .tk-check.done:hover { border-color: #22c55e; }

  .tk-row { transition: border-color .14s; }
  .tk-row:hover { border-color: color-mix(in srgb, var(--brand) 30%, var(--border)); }
  .tk-done { color: var(--text-faint); text-decoration: line-through; }

  .tk-del {
    flex-shrink: 0; display: grid; place-items: center; width: 30px; height: 30px; margin: -4px -4px 0 0;
    border: 0; border-radius: 8px; background: transparent; color: var(--text-faint); cursor: pointer;
    opacity: 0; transition: opacity .14s, color .14s, background .14s;
  }
  .pk-taskrow:hover .tk-del, .tk-del:focus-visible { opacity: 1; }
  .tk-del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
`;
