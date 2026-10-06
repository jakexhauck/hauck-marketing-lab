// Operations > Budget: what the agency spent in a month (Jake, 2026-10-06).
//
// A month is a list of line items (name, category, amount in dollars). Totals
// and the per-category split are computed here and never stored. Shared by the
// page and the API (which normalizes every write through normalizeItems), so
// the two cannot disagree about what a valid item is.

export interface BudgetItem {
  // Client-made, stable within a month so React keys survive edits.
  id: string;
  name: string;
  category: string;
  amount: number;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

const MAX_ITEMS = 200;
const MAX_TEXT = 120;

function text(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_TEXT);
}

// Turns a typed cell ("$1,200.50", "1200", "") into dollars. Anything that is
// not a finite number reads as 0 rather than throwing, so a stray keystroke
// never blocks a save.
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? round2(value) : 0;
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeItems(raw: unknown): BudgetItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BudgetItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = text(e.id) || newItemId();
    out.push({ id, name: text(e.name), category: text(e.category), amount: parseAmount(e.amount) });
  }
  return out;
}

export function budgetTotal(items: BudgetItem[]): number {
  return round2(items.reduce((sum, i) => sum + i.amount, 0));
}

// Biggest category first. A blank category groups as "Other".
export function categoryTotals(items: BudgetItem[]): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const i of items) {
    if (!i.amount) continue;
    const key = i.category || "Other";
    map.set(key, (map.get(key) ?? 0) + i.amount);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

// Suggestions for the category cell: the starters plus every category ever
// typed, case-insensitively de-duplicated, starters first.
export const STARTER_CATEGORIES = ["Software", "Payroll", "Ads", "Contractors", "Other"];

export function knownCategories(months: { items: BudgetItem[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (c: string) => {
    const key = c.toLowerCase();
    if (!c || seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  STARTER_CATEGORIES.forEach(add);
  for (const m of months) for (const i of m.items) add(i.category);
  return out;
}

// The newest saved month before `month` (YYYY-MM) that has items, for
// "Copy last month". Rows may come in any order.
export function previousItems(
  rows: { month: string; items: BudgetItem[] }[],
  month: string,
): BudgetItem[] | null {
  const before = rows
    .filter((r) => r.month.slice(0, 7) < month && r.items.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month));
  return before[0]?.items ?? null;
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Recurring expenses (Jake, 2026-10-06): typed once, counted in every month
// from `start` until `end` (both YYYY-MM, end inclusive, null = still running).
// Removing one in a later month ENDS it the month before, so the months it
// already counted in keep their totals; removing it in its first month drops
// it outright. An amount edit applies to every month it runs in.

export interface RecurringItem extends BudgetItem {
  start: string;
  end: string | null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeRecurring(raw: unknown): RecurringItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecurringItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const base = normalizeItems([entry])[0];
    if (!base) continue;
    const e = entry as Record<string, unknown>;
    const start = String(e.start ?? "").slice(0, 7);
    const end = e.end == null ? null : String(e.end).slice(0, 7);
    if (!MONTH_RE.test(start)) continue;
    out.push({ ...base, start, end: end && MONTH_RE.test(end) ? end : null });
  }
  return out;
}

export function isActiveIn(item: { start: string; end: string | null }, month: string): boolean {
  return item.start <= month && (item.end === null || item.end >= month);
}

export function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function removeRecurring<T extends { id: string; start: string; end: string | null }>(
  items: T[],
  id: string,
  month: string,
): T[] {
  const out: T[] = [];
  for (const i of items) {
    if (i.id !== id) out.push(i);
    else if (i.start < month) out.push({ ...i, end: stepMonth(month, -1) });
  }
  return out;
}
