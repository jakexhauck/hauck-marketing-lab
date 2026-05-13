/**
 * Sidebar Forms layout — user-editable categorisation of forms.
 *
 * Default layout is derived from each FormConfig's category/phase metadata, but
 * once the user customises it (renames a category, drags a form, etc.) the
 * resulting layout is persisted to localStorage and used in place of the default.
 *
 * On every load we reconcile against the current ALL_FORM_CONFIGS list so new
 * forms appear in a sensible bucket and removed forms are dropped silently.
 */

import {
  ALL_FORM_CONFIGS,
  groupFormsByCategory,
  type FormConfig,
  type FormSurfaceId,
} from "./formConfigs";

const STORAGE_KEY = "hml.sidebar.formLayout.v1";

export type SidebarCategory = {
  /** Stable id — never shown. Generated from name + random suffix on create. */
  id: string;
  /** Display name shown in the sidebar header. */
  name: string;
  /** Ordered list of form ids that belong to this category. */
  formIds: string[];
  /** Persisted open/closed state of the category in the sidebar. */
  collapsed?: boolean;
};

export type SidebarLayout = {
  categories: SidebarCategory[];
};

function makeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "cat";
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Build the default layout from current form metadata: phases in order, then Misc, then Reports. */
export function defaultLayoutFromConfigs(configs: FormConfig[]): SidebarLayout {
  const { phaseGroups, miscGroup, reportsGroup } = groupFormsByCategory(configs);
  const categories: SidebarCategory[] = [];
  for (const g of phaseGroups) {
    categories.push({
      id: `phase-${g.phase}`,
      name: `Phase ${String(g.phase).padStart(2, "0")} · ${g.phaseName}`,
      formIds: g.forms.map((f) => f.id),
    });
  }
  if (miscGroup) {
    categories.push({
      id: "misc",
      name: "Misc · Tools",
      formIds: miscGroup.forms.map((f) => f.id),
    });
  }
  if (reportsGroup) {
    categories.push({
      id: "reports",
      name: "Reports",
      formIds: reportsGroup.forms.map((f) => f.id),
    });
  }
  return { categories };
}

/** Drop unknown form ids and append any unassigned forms to a fallback category. */
export function reconcile(layout: SidebarLayout, configs: FormConfig[]): SidebarLayout {
  const validIds = new Set(configs.map((c) => c.id));
  const seen = new Set<string>();
  const categories: SidebarCategory[] = layout.categories.map((cat) => {
    const formIds: string[] = [];
    for (const id of cat.formIds) {
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        formIds.push(id);
      }
    }
    return { ...cat, formIds };
  });

  const orphans = configs.filter((c) => !seen.has(c.id));
  if (orphans.length > 0) {
    // Bucket orphans by their default category so new forms land somewhere sensible.
    const orphanLayout = defaultLayoutFromConfigs(orphans);
    for (const defCat of orphanLayout.categories) {
      // Try to merge into an existing category with the same name.
      const existing = categories.find((c) => c.name === defCat.name);
      if (existing) {
        existing.formIds.push(...defCat.formIds);
      } else {
        categories.push(defCat);
      }
    }
  }

  return { categories };
}

export function loadLayout(configs: FormConfig[] = ALL_FORM_CONFIGS): SidebarLayout {
  if (typeof window === "undefined") return defaultLayoutFromConfigs(configs);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayoutFromConfigs(configs);
    const parsed = JSON.parse(raw) as SidebarLayout;
    if (!parsed || !Array.isArray(parsed.categories)) {
      return defaultLayoutFromConfigs(configs);
    }
    return reconcile(parsed, configs);
  } catch {
    return defaultLayoutFromConfigs(configs);
  }
}

export function saveLayout(layout: SidebarLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage may be unavailable (private mode, quota) — ignore.
  }
}

export function clearLayout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function newCategory(name: string): SidebarCategory {
  return { id: makeId(name), name, formIds: [] };
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length) return arr;
  const clamped = Math.max(0, Math.min(arr.length - 1, to));
  if (from === clamped) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

/** Convenience: lookup form configs by id, preserving the layout's order. */
export function formsForCategory(
  cat: SidebarCategory,
  byId: Map<string, FormConfig>,
): FormConfig[] {
  const out: FormConfig[] = [];
  for (const id of cat.formIds) {
    const cfg = byId.get(id);
    if (cfg) out.push(cfg);
  }
  return out;
}

export type FormId = FormSurfaceId;
