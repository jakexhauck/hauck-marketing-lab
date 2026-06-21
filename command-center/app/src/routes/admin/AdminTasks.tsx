import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, Loader2, ListChecks } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { api, type AdminClient, type AdminTask } from "../../lib/api";

const inputCls =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

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

  const countLabel = loading
    ? "Loading..."
    : `${openCount} open ${openCount === 1 ? "task" : "tasks"}`;

  return (
    <DesktopPage title="Tasks" subtitle={countLabel}>
      {/* Add form */}
      <form
        onSubmit={onAdd}
        className="mb-5 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]"
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
          <Button type="submit" variant="primary" loading={submitting}>
            <Plus size={16} /> Add
          </Button>
        </div>
        {formError && <p className="mt-2 text-sm text-danger">{formError}</p>}
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
                  ? "bg-brand text-brand-fg"
                  : "border border-border text-muted hover:text-text",
              ].join(" ")}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading tasks...
        </div>
      ) : loadError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          {loadError}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-16 text-center">
          <ListChecks size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-muted">Nothing here yet. Add a task above.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
          {visible.map((task, idx) => {
            const d = task.dueDate ? dueLabel(task.dueDate) : null;
            return (
              <div
                key={task.id}
                className={[
                  "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2",
                  idx === visible.length - 1 ? "" : "border-b border-divider",
                ].join(" ")}
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
                      task.completed ? "text-faint line-through" : "text-text",
                    ].join(" ")}
                  >
                    {task.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-medium text-muted">
                      {task.clientName ?? "Agency"}
                    </span>
                    {d && (
                      <span
                        className={
                          d.overdue && !task.completed
                            ? "font-medium text-danger"
                            : "text-faint"
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-faint opacity-0 transition-opacity hover:bg-danger-tint hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </DesktopPage>
  );
}
