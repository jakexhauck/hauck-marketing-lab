// Category palette and name rules for the Pages Functions build.
//
// Mirror of the same rules in src/lib/taskCategories.ts (separate tsconfig, no
// cross-import), the way functions/lib/taskStatus.ts mirrors src/lib/taskStatus.
// The endpoints validate with this copy; the console renders with the other.
// Both mirror the check constraint on admin_task_categories.color (0063).

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

// Enum guard for untrusted input. An unknown token would pass the insert and
// then paint an unstyled pill, so it is rejected at the edge instead.
export function isValidColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && (CATEGORY_COLORS as readonly string[]).includes(value);
}

export const MAX_CATEGORY_NAME = 32;

// One spelling of a name: outer whitespace gone, inner runs collapsed, capped.
// The unique index is on lower(name), so this is what stops " Client  Work "
// and "Client Work" from being two rows that look identical in the dropdown.
export function normalizeCategoryName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CATEGORY_NAME);
}
