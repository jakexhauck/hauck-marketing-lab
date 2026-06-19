import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import BrandedButton from "./BrandedButton";
import {
  useCreateTask,
  useDeleteTask,
  useTasksQuery,
  useToggleTask,
  useUpdateTask,
} from "../hooks/useApi";
import type { ApiTask } from "../lib/api";

interface Props {
  contactId: string;
  onToast?: (message: string) => void;
}

const OVERDUE_COLOR = "#e11d48";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]";

const dueFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

// ISO -> value for <input type="date"> (YYYY-MM-DD), in local time.
function toDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// <input type="date"> value -> ISO at end of that day, or undefined if empty.
function fromDateInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T23:59:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function formatDue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dueFmt.format(d);
}

function isOverdue(task: ApiTask): boolean {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(task.dueDate).getTime();
  if (Number.isNaN(due)) return false;
  return due < Date.now();
}

export default function TaskList({ contactId, onToast }: Props) {
  const tasksQuery = useTasksQuery(contactId, true);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");

  const tasks = tasksQuery.data?.tasks ?? [];

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate(
      { contactId, title: trimmed, dueDate: fromDateInput(due) },
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
          onToast?.("Task added");
        },
        onError: () => onToast?.("Could not add task"),
      },
    );
  };

  const startEdit = (task: ApiTask) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDue(toDateInput(task.dueDate));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDue("");
  };

  const handleUpdate = (taskId: string) => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    updateTask.mutate(
      { contactId, taskId, title: trimmed, dueDate: fromDateInput(editDue) },
      {
        onSuccess: () => {
          cancelEdit();
          onToast?.("Task updated");
        },
        onError: () => onToast?.("Could not update task"),
      },
    );
  };

  const handleToggle = (task: ApiTask) => {
    toggleTask.mutate(
      { contactId, taskId: task.id, completed: !task.completed },
      { onError: () => onToast?.("Could not update task") },
    );
  };

  const handleDelete = (taskId: string) => {
    if (!window.confirm("Delete this task?")) return;
    deleteTask.mutate(
      { contactId, taskId },
      {
        onSuccess: () => onToast?.("Task deleted"),
        onError: () => onToast?.("Could not delete task"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a follow-up task."
          className={inputClass}
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Due date"
            className={`${inputClass} flex-1`}
          />
          <BrandedButton
            variant="primary"
            onClick={handleCreate}
            disabled={title.trim().length === 0 || createTask.isPending}
          >
            {createTask.isPending ? "Adding..." : "Add task"}
          </BrandedButton>
        </div>
      </div>

      {tasksQuery.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading tasks.</p>
      ) : tasksQuery.isError ? (
        <p className="text-sm text-[var(--text-muted)]">Could not load tasks.</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No tasks yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              {editingId === task.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={editDue}
                      onChange={(e) => setEditDue(e.target.value)}
                      aria-label="Due date"
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancel edit"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors active:scale-[0.96]"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate(task.id)}
                      disabled={
                        editTitle.trim().length === 0 || updateTask.isPending
                      }
                      aria-label="Save task"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--brand-primary)] transition-colors active:scale-[0.96] disabled:opacity-40"
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(task)}
                    aria-label={
                      task.completed ? "Mark task open" : "Mark task complete"
                    }
                    aria-pressed={task.completed}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors active:scale-[0.96]"
                    style={{
                      borderColor: task.completed
                        ? "var(--brand-primary)"
                        : "var(--border)",
                      background: task.completed
                        ? "var(--brand-primary)"
                        : "transparent",
                    }}
                  >
                    {task.completed && (
                      <Check size={13} color="#fff" aria-hidden="true" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`break-words text-sm ${
                        task.completed
                          ? "text-[var(--text-faint)] line-through"
                          : "text-[var(--text)]"
                      }`}
                    >
                      {task.title}
                    </div>
                    {task.dueDate && (
                      <div
                        className="label-cap mt-1"
                        style={{
                          color: isOverdue(task)
                            ? OVERDUE_COLOR
                            : "var(--text-faint)",
                        }}
                      >
                        {isOverdue(task) ? "Overdue " : "Due "}
                        {formatDue(task.dueDate)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(task)}
                      aria-label="Edit task"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors active:scale-[0.96]"
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(task.id)}
                      disabled={deleteTask.isPending}
                      aria-label="Delete task"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors active:scale-[0.96] disabled:opacity-40"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
