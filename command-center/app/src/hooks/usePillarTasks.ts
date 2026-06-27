// Data + mutations for a single pillar's task list (the pillar workspace Tasks
// tab). Plain api() + useState, matching the rest of the admin console
// (AdminTasks.tsx); the admin side does not use react-query.
//
// AdminPillar owns one instance and passes the result down to TasksTab, so the
// tab-count badge and the list share a single fetch and stay in sync. Toggle and
// delete are optimistic with rollback, the same pattern as AdminTasks.

import { useCallback, useEffect, useState } from "react";
import { api, type AdminTask } from "../lib/api";

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

  const deleteTask = useCallback(async (task: AdminTask) => {
    let prev: AdminTask[] = [];
    setTasks((list) => {
      prev = list;
      return list.filter((t) => t.id !== task.id);
    });
    try {
      await api(`/api/admin/tasks/${task.id}`, { method: "DELETE" });
    } catch {
      setTasks(prev);
    }
  }, []);

  return { tasks, loading, error, adding, addTask, toggleTask, deleteTask };
}
