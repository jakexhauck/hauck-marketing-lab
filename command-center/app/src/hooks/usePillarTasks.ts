// Data + mutations for a single pillar's task list (the pillar workspace Tasks
// tab). Plain api() + useState, matching the rest of the admin console
// (AdminTasks.tsx); the admin side does not use react-query.
//
// AdminPillar owns one instance and passes the result down to TasksTab, so the
// tab-count badge and the list share a single fetch and stay in sync. Toggle is
// optimistic with rollback; delete is deferred behind an undo window (see
// lib/undoQueue) so a mis-click is recoverable, the same pattern as AdminTasks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type AdminTask } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { createUndoQueue } from "../lib/undoQueue";

const UNDO_TOAST_MS = 6000;
const UNDO_WINDOW_MS = 6500;

export interface UsePillarTasks {
  tasks: AdminTask[];
  loading: boolean;
  error: string | null;
  adding: boolean;
  addTask: (title: string) => Promise<void>;
  toggleTask: (task: AdminTask) => Promise<void>;
  deleteTask: (task: AdminTask) => Promise<void>;
}

export function usePillarTasks(pillarId: string): UsePillarTasks {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    // No pillar (e.g. the invalid-pillar redirect path): nothing to load.
    if (!pillarId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { tasks } = await api<{ tasks: AdminTask[] }>(
          `/api/admin/tasks?pillarId=${encodeURIComponent(pillarId)}`,
        );
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
  }, [pillarId]);

  const addTask = useCallback(
    async (rawTitle: string) => {
      const title = rawTitle.trim();
      if (!title) return;
      setAdding(true);
      try {
        const { task } = await api<{ task: AdminTask }>("/api/admin/tasks", {
          method: "POST",
          body: JSON.stringify({ pillarId, title }),
        });
        // New tasks sort after the seed/open list, so append.
        setTasks((list) => [...list, task]);
      } finally {
        setAdding(false);
      }
    },
    [pillarId],
  );

  const toggleTask = useCallback(async (task: AdminTask) => {
    const next = !task.completed;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    try {
      await api(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setTasks((list) =>
        list.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t)),
      );
    }
  }, []);

  // Put a removed task back where it was, so undo does not reshuffle the list.
  const restore = useCallback((task: AdminTask, index: number) => {
    setTasks((list) => {
      if (list.some((t) => t.id === task.id)) return list;
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, task);
      return next;
    });
  }, []);

  const queue = useMemo(
    () =>
      createUndoQueue<{ task: AdminTask; index: number }>({
        delayMs: UNDO_WINDOW_MS,
        commit: ({ task }) => api(`/api/admin/tasks/${task.id}`, { method: "DELETE" }).then(() => {}),
        onCommitError: ({ task, index }) => {
          restore(task, index);
          setError("Could not delete that task. It has been put back.");
        },
      }),
    [restore],
  );

  // The write is deferred, so leaving the page must not quietly drop it.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => () => queueRef.current.flushAll(), []);

  const deleteTask = useCallback(
    async (task: AdminTask) => {
      // Read the position off the rendered list: a state updater would not have
      // run yet by the time we schedule.
      const index = Math.max(
        0,
        tasks.findIndex((t) => t.id === task.id),
      );
      setTasks((list) => list.filter((t) => t.id !== task.id));
      queue.schedule(task.id, { task, index });
      showToast("Task deleted", {
        durationMs: UNDO_TOAST_MS,
        action: {
          label: "Undo",
          onAction: () => {
            if (queue.undo(task.id)) restore(task, index);
          },
        },
      });
    },
    [tasks, queue, restore, showToast],
  );

  return { tasks, loading, error, adding, addTask, toggleTask, deleteTask };
}
