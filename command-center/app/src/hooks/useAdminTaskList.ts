// Data + mutations for the Operations pillar's Tasks tab: the standalone agency
// checklist (pillar_id null), which is what GET /api/admin/tasks returns with no
// ?pillarId. Plain api() + useState, matching the rest of the admin console; the
// admin side does not use react-query.
//
// Every edit is optimistic with rollback: the row settles under the cursor and
// only snaps back if the write actually failed. The completed/status coupling
// comes from the shared pure helper in ../lib/taskStatus so the checkbox and the
// pill agree client-side before the server re-derives the same pair.

import { useCallback, useEffect, useState } from "react";
import { api, type AdminTask } from "../lib/api";
import { moveItem, openFirst } from "../lib/taskOrder";
import { deriveCoupling, type TaskStatus } from "../lib/taskStatus";

// The inline-editable free-text cells.
export type TaskTextField = "title" | "note" | "updates";

export interface UseAdminTaskList {
  tasks: AdminTask[];
  loading: boolean;
  error: string | null;
  adding: boolean;
  // Appends a blank todo row and returns its id so the caller can focus it.
  addTask: () => Promise<string | null>;
  patchField: (task: AdminTask, field: TaskTextField, value: string) => Promise<void>;
  // Files the task under a category, or null for Uncategorised.
  setCategory: (task: AdminTask, categoryId: string | null) => Promise<void>;
  // Local-only: drops a deleted category from every row that carried it. The
  // server has already done this (ON DELETE SET NULL), so this only keeps the
  // rows on screen honest without a refetch.
  forgetCategory: (categoryId: string) => void;
  setStatus: (task: AdminTask, status: TaskStatus) => Promise<void>;
  toggleDone: (task: AdminTask) => Promise<void>;
  // Removes a task. Optimistic: the row disappears at once and is put back if
  // the delete fails.
  deleteTask: (task: AdminTask) => Promise<void>;
  // Drag-to-reorder: moves the row at fromIndex to toIndex (indices into the
  // rendered list). Optimistic with rollback, like every other edit here.
  moveTask: (fromIndex: number, toIndex: number) => Promise<void>;
}

export function useAdminTaskList(): UseAdminTaskList {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { tasks } = await api<{ tasks: AdminTask[] }>("/api/admin/tasks");
        if (!cancelled) setTasks(tasks ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load tasks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addTask = useCallback(async () => {
    setAdding(true);
    try {
      // No title: the row is created blank and the UI focuses the Task cell.
      const { task } = await api<{ task: AdminTask }>("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setTasks((list) => [...list, task]);
      return task.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add task");
      return null;
    } finally {
      setAdding(false);
    }
  }, []);

  // Writes one text cell. Called on blur, so a no-op blur costs no request.
  const patchField = useCallback(async (task: AdminTask, field: TaskTextField, value: string) => {
    const next = value.trim();
    if (next === (task[field] ?? "")) return;
    // A blank row's title stays blank until it is filled in; the endpoint
    // rejects clearing a title, so there is nothing to send.
    if (field === "title" && !next) return;

    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, [field]: next || null } : t)));
    try {
      await api(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: next }),
      });
    } catch {
      setTasks((list) =>
        list.map((t) => (t.id === task.id ? { ...t, [field]: task[field] } : t)),
      );
    }
  }, []);

  const setCategory = useCallback(async (task: AdminTask, categoryId: string | null) => {
    if (categoryId === task.categoryId) return;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, categoryId } : t)));
    try {
      await api(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that category.");
      setTasks((list) =>
        list.map((t) => (t.id === task.id ? { ...t, categoryId: task.categoryId } : t)),
      );
    }
  }, []);

  const forgetCategory = useCallback((categoryId: string) => {
    setTasks((list) =>
      list.map((t) => (t.categoryId === categoryId ? { ...t, categoryId: null } : t)),
    );
  }, []);

  // Shared writer for the two coupled controls (pill and checkbox).
  const writeCoupling = useCallback(
    async (task: AdminTask, incoming: { completed?: boolean; status?: TaskStatus }) => {
      const coupled = deriveCoupling({ completed: task.completed, status: task.status }, incoming);
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, ...coupled } : t)));
      try {
        await api(`/api/admin/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify(coupled),
        });
      } catch {
        setTasks((list) =>
          list.map((t) =>
            t.id === task.id ? { ...t, completed: task.completed, status: task.status } : t,
          ),
        );
      }
    },
    [],
  );

  const setStatus = useCallback(
    (task: AdminTask, status: TaskStatus) => writeCoupling(task, { status }),
    [writeCoupling],
  );

  const toggleDone = useCallback(
    (task: AdminTask) => writeCoupling(task, { completed: !task.completed }),
    [writeCoupling],
  );

  const deleteTask = useCallback(async (task: AdminTask) => {
    // Optimistic: drop the row immediately, put it back (in place) on failure.
    let index = 0;
    setTasks((list) => {
      index = list.findIndex((t) => t.id === task.id);
      return list.filter((t) => t.id !== task.id);
    });
    try {
      await api(`/api/admin/tasks/${task.id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that task.");
      setTasks((list) => {
        if (list.some((t) => t.id === task.id)) return list;
        const next = [...list];
        next.splice(index < 0 ? next.length : index, 0, task);
        return next;
      });
    }
  }, []);

  const moveTask = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    // Snapshot for rollback, then settle the drop locally: apply the move and
    // re-partition open-above-done, exactly what the next GET would return.
    let previous: AdminTask[] = [];
    let next: AdminTask[] = [];
    setTasks((list) => {
      previous = list;
      next = openFirst(moveItem(list, fromIndex, toIndex));
      return next;
    });
    if (next.length === 0) return;
    try {
      await api("/api/admin/tasks/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: next.map((t) => t.id) }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder tasks.");
      setTasks(previous);
    }
  }, []);

  return {
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
  };
}
