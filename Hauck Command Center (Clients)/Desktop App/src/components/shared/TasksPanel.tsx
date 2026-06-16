import { useState } from "react";
import { Trash2, Plus, Check } from "lucide-react";
import { useTasksQuery, useCreateTask, useToggleTask, useDeleteTask } from "@/hooks/useApi";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Spinner, EmptyState } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

// Self-contained tasks panel for a contact. Reused by the lead + contact drawers.
export function TasksPanel({ contactId }: { contactId: string }) {
  const { data, isLoading } = useTasksQuery(contactId);
  const create = useCreateTask(contactId);
  const toggle = useToggleTask(contactId);
  const remove = useDeleteTask(contactId);
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const tasks = data?.tasks ?? [];

  async function add() {
    const t = title.trim();
    if (!t) return;
    try {
      await create.mutateAsync({ title: t, dueDate: due || undefined });
      setTitle("");
      setDue("");
    } catch {
      toast("Couldn't create the task.", "error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="h-9 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="font-data h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-[12px] text-muted focus:border-brand focus:outline-none"
        />
        <Button variant="primary" size="icon" onClick={add} loading={create.isPending} disabled={!title.trim()} aria-label="Add task">
          {!create.isPending && <Plus size={16} />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks" description="Track follow-ups so nothing slips." className="py-8" />
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2"
            >
              <button
                onClick={() => toggle.mutate({ taskId: task.id, completed: !task.completed })}
                className={cn(
                  "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                  task.completed
                    ? "border-positive bg-positive text-white"
                    : "border-border-strong hover:border-brand",
                )}
                aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
              >
                {task.completed && <Check size={12} strokeWidth={3} />}
              </button>
              <span
                className={cn(
                  "flex-1 text-[13px]",
                  task.completed ? "text-faint line-through" : "text-text",
                )}
              >
                {task.title}
              </span>
              {task.dueDate && (
                <span className="font-data text-[11px] text-faint">{formatDate(task.dueDate)}</span>
              )}
              <button
                onClick={() => remove.mutate(task.id)}
                className="text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label="Delete task"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
