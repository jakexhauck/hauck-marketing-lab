// Data + mutations for the task categories the operator owns (0063).
//
// Same shape as useAdminTaskList: plain api() + useState, optimistic writes with
// rollback, because the admin console does not use react-query.
//
// One deliberate difference: creating a category is NOT optimistic. The server
// owns the uniqueness check (a lower(name) unique index), so a name that already
// exists comes back 409. Showing the chip first and yanking it away a moment
// later would be worse than the small wait.

import { useCallback, useEffect, useState } from "react";
import { api, type AdminTaskCategory } from "../lib/api";
import { normalizeCategoryName, type CategoryColor } from "../lib/taskCategories";
import { moveItem } from "../lib/taskOrder";

export interface UseAdminTaskCategories {
  categories: AdminTaskCategory[];
  loading: boolean;
  // The last write that failed, for the manage panel to show inline. Cleared on
  // the next attempt so a fixed name does not sit under a stale complaint.
  error: string | null;
  saving: boolean;
  // Returns the new category, or null when the write failed (duplicate name,
  // offline). The panel keeps the typed name on screen when it gets null back.
  addCategory: (name: string, color: CategoryColor) => Promise<AdminTaskCategory | null>;
  renameCategory: (category: AdminTaskCategory, name: string) => Promise<void>;
  recolorCategory: (category: AdminTaskCategory, color: CategoryColor) => Promise<void>;
  // One place up or down the list. The order is the order of the filter chips
  // above the checklist and of the dropdown on every row, so this is the only
  // control over both. A move at either end is a no-op rather than a wrap.
  moveCategory: (category: AdminTaskCategory, direction: -1 | 1) => Promise<void>;
  // Removes the category. The tasks filed under it are untouched by the server
  // (ON DELETE SET NULL) and fall back to Uncategorised.
  deleteCategory: (category: AdminTaskCategory) => Promise<void>;
  clearError: () => void;
}

export function useAdminTaskCategories(): UseAdminTaskCategories {
  const [categories, setCategories] = useState<AdminTaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { categories } = await api<{ categories: AdminTaskCategory[] }>(
          "/api/admin/task-categories",
        );
        if (!cancelled) setCategories(categories ?? []);
      } catch (err) {
        // A failed load leaves the checklist perfectly usable, just without
        // categories, so this reports rather than blocking the page.
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load categories");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const addCategory = useCallback(async (rawName: string, color: CategoryColor) => {
    const name = normalizeCategoryName(rawName);
    if (!name) return null;
    setSaving(true);
    setError(null);
    try {
      const { category } = await api<{ category: AdminTaskCategory }>(
        "/api/admin/task-categories",
        { method: "POST", body: JSON.stringify({ name, color }) },
      );
      setCategories((list) => [...list, category]);
      return category;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that category");
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  // Shared optimistic writer for the two edits that cannot fail structurally.
  const patchCategory = useCallback(
    async (category: AdminTaskCategory, patch: Partial<AdminTaskCategory>, fallback: string) => {
      setError(null);
      setCategories((list) =>
        list.map((c) => (c.id === category.id ? { ...c, ...patch } : c)),
      );
      try {
        await api(`/api/admin/task-categories/${category.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
        setCategories((list) => list.map((c) => (c.id === category.id ? category : c)));
      }
    },
    [],
  );

  const renameCategory = useCallback(
    async (category: AdminTaskCategory, rawName: string) => {
      const name = normalizeCategoryName(rawName);
      if (!name || name === category.name) return;
      await patchCategory(category, { name }, "Could not rename that category");
    },
    [patchCategory],
  );

  const recolorCategory = useCallback(
    async (category: AdminTaskCategory, color: CategoryColor) => {
      if (color === category.color) return;
      await patchCategory(category, { color }, "Could not recolour that category");
    },
    [patchCategory],
  );

  // Optimistic, then the WHOLE order is posted. The endpoint renumbers from the
  // list it is sent rather than being told "this one moved up": a relative move
  // has to be applied against a list the server re-reads, and two tabs nudging
  // at once interleave into an order neither of them asked for.
  const moveCategory = useCallback(
    async (category: AdminTaskCategory, direction: -1 | 1) => {
      const from = categories.findIndex((c) => c.id === category.id);
      const to = from + direction;
      // Off either end. Nothing to do, and nothing to say about it: the button
      // that would have done it is disabled, so this is only reachable by a
      // keyboard racing a re-render.
      if (from < 0 || to < 0 || to >= categories.length) return;

      setError(null);
      const previous = categories;
      const next = moveItem(categories, from, to);
      setCategories(next);
      try {
        await api("/api/admin/task-categories/reorder", {
          method: "POST",
          body: JSON.stringify({ ids: next.map((c) => c.id) }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reorder the categories");
        setCategories(previous);
      }
    },
    [categories],
  );

  const deleteCategory = useCallback(async (category: AdminTaskCategory) => {
    setError(null);
    // Optimistic: the chip goes at once, and is put back in place on failure.
    let index = 0;
    setCategories((list) => {
      index = list.findIndex((c) => c.id === category.id);
      return list.filter((c) => c.id !== category.id);
    });
    try {
      await api(`/api/admin/task-categories/${category.id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that category");
      setCategories((list) => {
        if (list.some((c) => c.id === category.id)) return list;
        const next = [...list];
        next.splice(index < 0 ? next.length : index, 0, category);
        return next;
      });
    }
  }, []);

  return {
    categories,
    loading,
    error,
    saving,
    addCategory,
    renameCategory,
    recolorCategory,
    moveCategory,
    deleteCategory,
    clearError,
  };
}
