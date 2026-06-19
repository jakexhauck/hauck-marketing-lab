import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, Loader2, ListChecks } from "lucide-react";
import { api, type AdminClient, type AdminTask } from "../../lib/api";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--brand-primary)]";

// The agency-wide bucket. A real value (not "") so it round-trips cleanly
// through the select; mapped to tenantId null on the way to the API.
const AGENCY = "__agency__";

function dueLabel(due: string): { text: string; overdue: boolean } {
  // Compare dates only, in local time, so "today" is never flagged overdue.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const overdue = d.getTime() < today.getTime();
  const text = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { text, overdue };
}

export default function AdminTasks() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add form.
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(AGENCY);
  const [due, setDue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Category filter ("" = all, AGENCY = agency-only, else a tenant id).
  const [filter, setFilter] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [taskData, clientData] = await Promise.all([
        api<{ tasks: AdminTask[] }>("/api/admin/tasks"),
        api<{ clients: AdminClient[] }>("/api/admin/clients"),
      ]);
      setTasks(taskData.tasks ?? []);
      setClients(clientData.clients ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Give the task a title.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const { task } = await api<{ task: AdminTask }>("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          tenantId: category === AGENCY ? null : category,
          dueDate: due || null,
        }),
      });
      setTasks((t) => [task, ...t]);
      setTitle("");
      setDue("");
      // Keep the category sticky: adding several tasks for one client is common.
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add task");
    } finally {
      setSubmitting(false);
    }
  };

  const onToggle = async (task: AdminTask) => {
    // Optimistic: flip locally, roll back if the write fails.
    const next = !task.completed;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    try {
      await api(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t)));
    }
  };

  const onDelete = async (task: AdminTask) => {
    const prev = tasks;
    setTasks((list) => list.filter((t) => t.id !== task.id));
    try {
      await api(`/api/admin/tasks/${task.id}`, { method: "DELETE" });
    } catch {
      setTasks(prev);
    }
  };

  const visible = useMemo(() => {
    if (!filter) return tasks;
    if (filter === AGENCY) return tasks.filter((t) => !t.tenantId);
    return tasks.filter((t) => t.tenantId === filter);
  }, [tasks, filter]);

  const openCount = visible.filter((t) => !t.completed).length;

  // Filter chips: All, Agency, then one per client. Clients are already ordered.
  const chips = [
    { value: "", label: "All" },
    { value: AGENCY, label: "Agency" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">Tasks</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {openCount} open {openCount === 1 ? "task" : "tasks"}
        </p>
      </div>

      {/* Add form */}
      <form
        onSubmit={onAdd}
        className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={`${inputCls} sm:flex-1`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task..."
          />
          <select
            className={`${inputCls} sm:w-44`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value={AGENCY}>Agency</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={`${inputCls} sm:w-40`}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60"
            style={{ background: "var(--brand-primary)" }}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>
        </div>
        {formError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{formError}</p>}
      </form>

      {/* Category filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value || "all"}
              onClick={() => setFilter(chip.value)}
              className={[
                "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                active
                  ? "text-[var(--brand-fg)]"
                  : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
              style={active ? { background: "var(--brand-primary)" } : undefined}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" /> Loading tasks...
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          {loadError}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-12 text-center">
          <ListChecks size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-muted)]">Nothing here yet. Add a task above.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((task) => {
            const d = task.dueDate ? dueLabel(task.dueDate) : null;
            return (
              <li
                key={task.id}
                className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => void onToggle(task)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={[
                      "truncate text-sm",
                      task.completed
                        ? "text-[var(--text-faint)] line-through"
                        : "text-[var(--text)]",
                    ].join(" ")}
                  >
                    {task.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 font-medium text-[var(--text-muted)]">
                      {task.clientName ?? "Agency"}
                    </span>
                    {d && (
                      <span
                        className={
                          d.overdue && !task.completed
                            ? "font-medium text-rose-600 dark:text-rose-400"
                            : "text-[var(--text-faint)]"
                        }
                      >
                        Due {d.text}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void onDelete(task)}
                  aria-label="Delete task"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
