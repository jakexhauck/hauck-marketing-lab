// Pure category rules for the Operations Tasks tab.
//
// Categories are operator-owned rows in admin_task_categories (0063), not a
// hardcoded list, so everything fixed about them lives here: the palette a
// category can be, what counts as a usable name, and how the checklist is
// filtered and counted by category.
//
// functions/lib/taskCategories.ts mirrors the palette and the name rules for
// the Pages Functions build (separate tsconfig, no cross-import). Keep the two
// in step: the endpoint validates with its copy, the console renders with this.

// The eight tokens a category can be coloured. Stored by name rather than as a
// hex value so the pill can resolve to the theme's own tints and stay readable
// in light and dark; a stored hex would only ever be right in one of them.
// Mirrored by the check constraint on admin_task_categories.color.
export const CATEGORY_COLORS = [
  "indigo",
  "sky",
  "green",
  "amber",
  "rose",
  "violet",
  "teal",
  "slate",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const DEFAULT_CATEGORY_COLOR: CategoryColor = "indigo";

// Enum guard for untrusted input (request bodies, stored rows). A row written
// before a token was renamed must never reach the page as an unstyled pill.
export function isValidColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && (CATEGORY_COLORS as readonly string[]).includes(value);
}

// Long enough for "Client Work", short enough that a pill stays a pill.
export const MAX_CATEGORY_NAME = 32;

// One spelling of a name: outer whitespace gone, inner runs collapsed, capped.
// Applied on both sides so " Client  Work " and "Client Work" cannot become two
// categories that look identical in the dropdown.
export function normalizeCategoryName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CATEGORY_NAME);
}

// The next free position when appending a category to the end of the list.
export function nextSortOrder(categories: { sortOrder: number }[]): number {
  return categories.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
}

// ===== Filtering and counting =====

// What the chip strip can be set to: every task, one category, or the tasks
// with no category at all. Uncategorised is a real choice the operator can
// make, not an absence, so it is a value here rather than null-means-all.
export type CategoryFilter = { kind: "all" } | { kind: "none" } | { kind: "id"; id: string };

export const ALL_CATEGORIES: CategoryFilter = { kind: "all" };

export function filterTasksByCategory<T extends { categoryId: string | null }>(
  tasks: T[],
  filter: CategoryFilter,
): T[] {
  if (filter.kind === "all") return tasks;
  if (filter.kind === "none") return tasks.filter((t) => t.categoryId === null);
  return tasks.filter((t) => t.categoryId === filter.id);
}

export interface CategoryTally {
  // Total across every task, whatever its category.
  all: number;
  // Tasks carrying no category.
  none: number;
  // Per category id. A category with no tasks is absent; read it as 0.
  byId: Record<string, number>;
}

export function tallyByCategory(tasks: { categoryId: string | null }[]): CategoryTally {
  const byId: Record<string, number> = {};
  let none = 0;
  for (const task of tasks) {
    if (task.categoryId === null) none += 1;
    else byId[task.categoryId] = (byId[task.categoryId] ?? 0) + 1;
  }
  return { all: tasks.length, none, byId };
}

export function isSameFilter(a: CategoryFilter, b: CategoryFilter): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "id" && b.kind === "id" ? a.id === b.id : true;
}
