// Pure helpers for admin work blocks. No React, no I/O, so this is unit-tested.

export type WorkBlockCategory = "deep" | "client" | "admin" | "off";

export interface WorkBlockCategoryMeta {
  key: WorkBlockCategory;
  label: string;
  // Filled chip for an in-app block (token-based; no raw hex).
  chipClass: string;
  // Small swatch dot for the editor's category picker.
  dotClass: string;
}

export const WORK_BLOCK_CATEGORIES: WorkBlockCategoryMeta[] = [
  { key: "deep", label: "Deep Work", chipClass: "bg-brand text-brand-fg", dotClass: "bg-brand" },
  { key: "client", label: "Client", chipClass: "bg-positive text-white", dotClass: "bg-positive" },
  { key: "admin", label: "Admin", chipClass: "bg-surface-3 text-[var(--text)]", dotClass: "bg-surface-3" },
  { key: "off", label: "Off", chipClass: "bg-danger-tint text-danger", dotClass: "bg-danger" },
];

export function categoryMeta(key: string): WorkBlockCategoryMeta {
  return WORK_BLOCK_CATEGORIES.find((c) => c.key === key) ?? WORK_BLOCK_CATEGORIES[0];
}

export function validateBlockTimes(startIso: string, endIso: string): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Enter a valid start and end time.";
  }
  if (end <= start) return "End time must be after the start time.";
  return null;
}

export function dedupeGoogleEvents<T extends { id: string }>(
  events: T[],
  blockEventIds: Array<string | null>,
): T[] {
  const taken = new Set(blockEventIds.filter((x): x is string => !!x));
  return events.filter((e) => !taken.has(e.id));
}
