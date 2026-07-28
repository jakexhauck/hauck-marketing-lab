import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, GripVertical, Plus, SlidersHorizontal, X } from "lucide-react";
import { useAdminTaskList, type TaskTextField } from "../../hooks/useAdminTaskList";
import { useAdminTaskCategories } from "../../hooks/useAdminTaskCategories";
import { taskCounts, type TaskStatus } from "../../lib/taskStatus";
import {
  ALL_CATEGORIES,
  filterTasksByCategory,
  isSameFilter,
  tallyByCategory,
  type CategoryFilter,
} from "../../lib/taskCategories";
import TaskCategoryManager from "./TaskCategoryManager";
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

// Sentinel values for the per-row category <select>. A select needs string
// values, and these two are not category ids: one files the task under nothing,
// the other opens the manage panel instead of writing anything.
const UNCATEGORISED = "__none";
const MANAGE = "__manage";

// A cell that shows everything typed into it. These were single-line inputs,
// which silently clipped a long task at the column edge; a textarea sized to
// its own content wraps instead and the row grows to fit.
//
// Enter still commits rather than inserting a newline, so the cell behaves the
// way the input it replaced did. Shift+Enter is left alone for a deliberate
// line break.
function AutoCell({
  value,
  placeholder,
  ariaLabel,
  autoFocus,
  onAutoFocused,
  onChange,
  onCommit,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  // Take focus on mount (the row just added). onAutoFocused fires once so the
  // parent can drop the request; without that the cell would grab focus back on
  // every keystroke and park the caret at the start.
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    onAutoFocused?.();
    // Runs on the autoFocus request alone; onAutoFocused is a fresh closure
    // each render and would otherwise re-fire this every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  // Re-measure on every value change, and on mount, so a stored task that
  // wraps to three lines opens at three lines rather than growing on first
  // keystroke. Layout effect so the row never paints at the wrong height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="otk-txt"
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => onCommit(e.target.value)}
    />
  );
}

export default function OperationsTasksTab() {
  const {
    tasks,
    loading,
    error,
    adding,
    addTask,
    patchField,
    setCategory,
    forgetCategory,
    setStatus,
    toggleDone,
    deleteTask,
    moveTask,
  } = useAdminTaskList();
  const categoryCtl = useAdminTaskCategories();
  const { categories } = categoryCtl;
  // Which category the list is narrowed to, and whether the manage panel is up.
  const [filter, setFilter] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [managerOpen, setManagerOpen] = useState(false);
  // Uncommitted keystrokes per row, keyed by task id then field. Cleared on
  // blur once the write is away, so the row falls back to the stored value.
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<TaskTextField, string>>>>({});
  // The row whose Task cell should take focus (the row just added).
  const [focusId, setFocusId] = useState<string | null>(null);
  // Drag-to-reorder state. Rows carry inputs, so a row only becomes draggable
  // while the mouse is down on its grip (armedId); dragIndex is the row in
  // flight and insertIndex the gap the drop would land in (0..tasks.length).
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  const endDrag = () => {
    setArmedId(null);
    setDragIndex(null);
    setInsertIndex(null);
  };

  const onRowDragOver = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Top half of a row inserts before it, bottom half after it.
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setInsertIndex(before ? index : index + 1);
  };

  const onRowDrop = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    if (dragIndex !== null && insertIndex !== null) {
      // Removing the dragged row first shifts every gap below it up by one.
      const target = insertIndex > dragIndex ? insertIndex - 1 : insertIndex;
      void moveTask(dragIndex, target);
    }
    endDrag();
  };

  // The rows on screen. Under "All" this is the whole list, which is what makes
  // the drag indices below safe: moveTask addresses the stored order, so
  // reordering is only offered when what is rendered IS the stored order.
  const visible = filterTasksByCategory(tasks, filter);
  const canReorder = filter.kind === "all";
  const counts = taskCounts(visible);
  const tally = tallyByCategory(tasks);

  const chips: { key: string; label: string; count: number; value: CategoryFilter }[] = [
    { key: "all", label: "All", count: tally.all, value: ALL_CATEGORIES },
    ...categories.map((c) => ({
      key: c.id,
      label: c.name,
      count: tally.byId[c.id] ?? 0,
      value: { kind: "id", id: c.id } as CategoryFilter,
    })),
    // Only worth offering when something is actually uncategorised.
    ...(tally.none > 0
      ? [
          {
            key: "none",
            label: "Uncategorised",
            count: tally.none,
            value: { kind: "none" } as CategoryFilter,
          },
        ]
      : []),
  ];

  const categoryOf = (task: AdminTask) => categories.find((c) => c.id === task.categoryId) ?? null;

  const onCategoryChange = (task: AdminTask, value: string) => {
    if (value === MANAGE) {
      setManagerOpen(true);
      return;
    }
    void setCategory(task, value === UNCATEGORISED ? null : value);
  };

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
        <div className="otk-chips" role="group" aria-label="Filter by category">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`otk-chip${isSameFilter(filter, chip.value) ? " on" : ""}`}
              aria-pressed={isSameFilter(filter, chip.value)}
              onClick={() => setFilter(chip.value)}
            >
              {chip.label}
              <span className="otk-chipn">{chip.count}</span>
            </button>
          ))}
          <button
            type="button"
            className="otk-chip otk-chipmanage"
            onClick={() => setManagerOpen(true)}
          >
            <SlidersHorizontal size={13} strokeWidth={2.4} />
            {categories.length === 0 ? "Add categories" : "Manage"}
          </button>
        </div>

        <button type="button" className="otk-add" onClick={() => void onAdd()} disabled={adding}>
          <Plus size={16} strokeWidth={2.4} />
          {adding ? "Adding" : "Add task"}
        </button>
      </div>

      {managerOpen ? (
        <TaskCategoryManager
          controller={categoryCtl}
          onClose={() => setManagerOpen(false)}
          onDeleted={(id) => {
            forgetCategory(id);
            // Sitting on a filter for a category that no longer exists would
            // show an empty list with no way back except a page reload.
            setFilter((f) => (f.kind === "id" && f.id === id ? ALL_CATEGORIES : f));
          }}
        />
      ) : null}

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
        ) : visible.length === 0 ? (
          <div className="otk-state">
            Nothing filed under this category yet.{" "}
            <button type="button" className="otk-link" onClick={() => setFilter(ALL_CATEGORIES)}>
              Show all tasks
            </button>
          </div>
        ) : (
          <div className="otk-scroll">
            <table>
              <thead>
                <tr>
                  <th className="otk-griphead" aria-label="Reorder" />
                  <th>Done</th>
                  <th>Task</th>
                  <th>Notes / Files</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Updates</th>
                  <th className="otk-delhead" aria-label="Remove" />
                </tr>
              </thead>
              <tbody
                onDragLeave={(e) => {
                  // Only clear the indicator when the drag leaves the table
                  // body entirely, not when it crosses between rows.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setInsertIndex(null);
                }}
              >
                {visible.map((task, index) => (
                  <tr
                    key={task.id}
                    className={[
                      task.completed ? "otk-rowdone" : "",
                      dragIndex === index ? "otk-dragging" : "",
                      insertIndex === index ? "otk-drop-before" : "",
                      insertIndex === visible.length && index === visible.length - 1
                        ? "otk-drop-after"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    draggable={canReorder && armedId === task.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragIndex(index);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(e) => onRowDragOver(e, index)}
                    onDrop={onRowDrop}
                  >
                    <td className="otk-gripcol">
                      {/* Reordering a filtered list would write the wrong
                          order, so the grip is only offered under "All". */}
                      {canReorder ? (
                        <span
                          className="otk-grip"
                          title="Drag to reorder"
                          aria-hidden="true"
                          onMouseDown={() => setArmedId(task.id)}
                          onMouseUp={() => setArmedId(null)}
                        >
                          <GripVertical size={15} strokeWidth={2.2} />
                        </span>
                      ) : null}
                    </td>
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
                      <AutoCell
                        value={draftValue(task, "title")}
                        placeholder="New task"
                        ariaLabel="Task"
                        autoFocus={focusId === task.id}
                        onAutoFocused={() => setFocusId(null)}
                        onChange={(v) => onCellChange(task, "title", v)}
                        onCommit={(v) => onCellBlur(task, "title", v)}
                      />
                    </td>
                    <td className="otk-notescol">
                      <AutoCell
                        value={draftValue(task, "note")}
                        placeholder="Notes"
                        ariaLabel="Notes"
                        onChange={(v) => onCellChange(task, "note", v)}
                        onCommit={(v) => onCellBlur(task, "note", v)}
                      />
                    </td>
                    <td className="otk-catcol">
                      <span className="otk-pill">
                        <select
                          className={`otk-cat c-${categoryOf(task)?.color ?? "none"}`}
                          value={task.categoryId ?? UNCATEGORISED}
                          aria-label="Category"
                          onChange={(e) => onCategoryChange(task, e.target.value)}
                        >
                          <option value={UNCATEGORISED}>Uncategorised</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value={MANAGE}>Manage categories</option>
                        </select>
                        <ChevronDown className="otk-caret" size={13} strokeWidth={2.4} />
                      </span>
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
                      <AutoCell
                        value={draftValue(task, "updates")}
                        placeholder="Add an update"
                        ariaLabel="Updates"
                        onChange={(v) => onCellChange(task, "updates", v)}
                        onCommit={(v) => onCellBlur(task, "updates", v)}
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
      /* A row that has wrapped to several lines reads better with its controls
         at the top of the row than floating in the middle of the text. */
      .pk-kit .otk-card tbody td.otk-gripcol,
      .pk-kit .otk-card tbody td.otk-donecol,
      .pk-kit .otk-card tbody td.otk-statuscol,
      .pk-kit .otk-card tbody td.otk-delcol { vertical-align: top; padding-top: 12px; }
      .pk-kit .otk-card tbody td.otk-taskcol,
      .pk-kit .otk-card tbody td.otk-notescol,
      .pk-kit .otk-card tbody td.otk-updcol { vertical-align: top; }
      .pk-kit .otk-card tbody tr:hover td { background: var(--otk-hover); }

      /* Drag-to-reorder: a grip that arms the row for HTML5 drag, a dimmed row
         in flight, and a 2px indigo line marking the gap the drop lands in. */
      .pk-kit .otk-card th.otk-griphead { width: 34px; }
      .pk-kit .otk-card td.otk-gripcol { width: 34px; padding-right: 0; }
      .pk-kit .otk-grip {
        display: grid; place-items: center; width: 24px; height: 24px;
        color: var(--text-faint); cursor: grab; border-radius: 6px;
        opacity: 0; transition: opacity .12s, background .12s;
      }
      .pk-kit .otk-card tbody tr:hover .otk-grip { opacity: .8; }
      .pk-kit .otk-grip:hover { background: var(--otk-input-hover); opacity: 1; }
      .pk-kit .otk-grip:active { cursor: grabbing; }
      .pk-kit .otk-card tr.otk-dragging td { opacity: .45; }
      .pk-kit .otk-card tr.otk-drop-before td { box-shadow: inset 0 2px 0 var(--otk-indigo); }
      .pk-kit .otk-card tr.otk-drop-after td { box-shadow: inset 0 -2px 0 var(--otk-indigo); }

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

      /* A textarea rather than an input, so a long task wraps and stays
         readable. Sized to its content in JS (AutoCell); resize and the scroll
         gutter are off so it reads as a cell, not a form control. */
      .pk-kit .otk-card td .otk-txt {
        width: 100%; border: 0; background: transparent; font: inherit; color: var(--text);
        padding: 6px 8px; border-radius: 8px; transition: background .12s, box-shadow .12s;
        display: block; resize: none; overflow: hidden; line-height: 1.45;
        white-space: pre-wrap; overflow-wrap: anywhere;
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

      /* ===== Categories =====
         One hue per palette token (mirrors CATEGORY_COLORS in
         src/lib/taskCategories.ts). Each .c-<token> only sets --swatch; the
         pills, chips and dots all derive their fill and ink from that one var
         with color-mix, so a new token is one line here rather than four rules,
         and light/dark differ only in what the ink is mixed toward. */
      .pk-kit .otk {
        --c-indigo: #6366f1; --c-sky: #0ea5e9; --c-green: #10b981; --c-amber: #f59e0b;
        --c-rose: #f43f5e;   --c-violet: #8b5cf6; --c-teal: #14b8a6; --c-slate: #64748b;
        --otk-ink-mix: #000; --otk-ink-pct: 62%; --otk-tint-pct: 13%;
      }
      [data-theme="dark"] .pk-kit .otk {
        --otk-ink-mix: #fff; --otk-ink-pct: 55%; --otk-tint-pct: 20%;
      }
      .pk-kit .otk .c-indigo { --swatch: var(--c-indigo); }
      .pk-kit .otk .c-sky    { --swatch: var(--c-sky); }
      .pk-kit .otk .c-green  { --swatch: var(--c-green); }
      .pk-kit .otk .c-amber  { --swatch: var(--c-amber); }
      .pk-kit .otk .c-rose   { --swatch: var(--c-rose); }
      .pk-kit .otk .c-violet { --swatch: var(--c-violet); }
      .pk-kit .otk .c-teal   { --swatch: var(--c-teal); }
      .pk-kit .otk .c-slate  { --swatch: var(--c-slate); }

      /* Filter chips: the category strip above the table. */
      .pk-kit .otk-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pk-kit .otk-chip {
        display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text-muted); font: inherit; font-size: 12.5px;
        font-weight: 600; padding: 7px 13px; border-radius: 999px; cursor: pointer;
        transition: background .14s, color .14s, border-color .14s;
      }
      .pk-kit .otk-chip:hover { background: var(--otk-input-hover); color: var(--text); }
      .pk-kit .otk-chip.on {
        background: var(--otk-indigo); border-color: var(--otk-indigo); color: #fff;
      }
      .pk-kit .otk-chip:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--otk-indigo); }
      .pk-kit .otk-chipn {
        font-size: 11px; font-variant-numeric: tabular-nums; opacity: .7;
        background: color-mix(in srgb, currentColor 14%, transparent);
        padding: 1px 6px; border-radius: 999px; min-width: 18px; text-align: center;
      }
      .pk-kit .otk-chipmanage { color: var(--text-faint); border-style: dashed; }

      /* The per-row category pill. Same silhouette as the status pill so the two
         read as one control strip rather than two unrelated widgets. */
      .pk-kit .otk-card td.otk-catcol { width: 150px; vertical-align: top; padding-top: 12px; }
      .pk-kit .otk-cat {
        appearance: none; -webkit-appearance: none; border: 0; cursor: pointer; font: inherit;
        font-weight: 600; font-size: 12.5px; padding: 6px 30px 6px 13px; border-radius: 999px;
        max-width: 100%; transition: .14s;
        background: color-mix(in srgb, var(--swatch) var(--otk-tint-pct), transparent);
        color: color-mix(in srgb, var(--swatch) var(--otk-ink-pct), var(--otk-ink-mix));
      }
      /* Uncategorised: no hue to carry, so it reads as a quiet placeholder. */
      .pk-kit .otk-cat.c-none { background: transparent; color: var(--text-faint); font-weight: 500; }
      .pk-kit .otk-cat.c-none:hover { background: var(--otk-input-hover); }
      .pk-kit .otk-cat:focus { outline: 0; box-shadow: 0 0 0 2px var(--otk-indigo); }

      .pk-kit .otk-link {
        border: 0; background: none; padding: 0; font: inherit; color: var(--otk-indigo);
        font-weight: 600; cursor: pointer; text-decoration: underline;
      }

      /* ===== Manage categories panel ===== */
      .pk-kit .otk-modal { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; }
      .pk-kit .otk-scrim {
        position: absolute; inset: 0; border: 0; padding: 0; cursor: default;
        background: rgba(9, 12, 20, .45); backdrop-filter: blur(2px);
      }
      .pk-kit .otk-panel {
        position: relative; width: min(420px, calc(100vw - 32px)); max-height: min(80vh, 640px);
        display: flex; flex-direction: column; background: var(--surface);
        border: 1px solid var(--border); border-radius: 20px; box-shadow: var(--shadow-lg, 0 24px 60px -20px rgba(0,0,0,.5));
        overflow: hidden;
      }
      .pk-kit .otk-panelhead {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 16px 12px 20px; border-bottom: 1px solid var(--border);
      }
      .pk-kit .otk-panelerr {
        padding: 10px 20px; font-size: 12.5px; color: var(--danger);
        background: color-mix(in srgb, var(--danger) 10%, transparent);
      }
      .pk-kit .otk-panelbody { overflow: auto; padding: 8px 12px; flex: 1; }
      .pk-kit .otk-catlist { list-style: none; margin: 0; padding: 0; }
      .pk-kit .otk-catrow {
        display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 12px;
        position: relative; flex-wrap: wrap;
      }
      .pk-kit .otk-catrow:hover { background: var(--otk-hover); }
      .pk-kit .otk-swatch {
        width: 22px; height: 22px; flex: 0 0 auto; border-radius: 8px; cursor: pointer;
        border: 1px solid color-mix(in srgb, var(--swatch) 45%, transparent);
        background: var(--swatch); color: #fff; display: grid; place-items: center; padding: 0;
        transition: transform .12s, box-shadow .12s;
      }
      .pk-kit .otk-swatch:hover { transform: scale(1.08); }
      .pk-kit .otk-swatch.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--swatch); }
      .pk-kit .otk-swatch:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--otk-indigo); }
      .pk-kit .otk-catname {
        flex: 1 1 120px; min-width: 0; border: 1px solid transparent; background: transparent;
        font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text);
        padding: 7px 10px; border-radius: 9px; transition: background .12s, border-color .12s;
      }
      .pk-kit .otk-catname:hover { background: var(--otk-input-hover); }
      .pk-kit .otk-catname:focus { outline: 0; background: var(--surface); border-color: var(--otk-indigo); }
      /* The expanded colour picker sits on its own line under the row it edits. */
      .pk-kit .otk-picker { display: flex; gap: 7px; flex-wrap: wrap; flex-basis: 100%; padding: 4px 2px 2px; }
      .pk-kit .otk-addcat { border-top: 1px solid var(--border); padding: 12px 20px 16px; }
      .pk-kit .otk-addrow { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
      .pk-kit .otk-addcat .otk-catname {
        border-color: var(--border); background: var(--otk-input-hover);
      }
      .pk-kit .otk-addcat .otk-add { margin-left: 0; padding: 9px 14px; }

      @media (max-width: 720px) { .pk-kit .otk-add { margin-left: 0; } }
    `}</style>
  );
}
