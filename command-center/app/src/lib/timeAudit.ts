// Pure model behind the Operations "Time Audit" surface: a week of 30-minute
// blocks (6:00 AM to 10:00 PM, Mon to Sun) where each tagged block carries a
// task type and the leverage tier that task defaults to. Every dollar figure on
// the page comes from here, so the component stays a pure view.
//
// No React, no Date.now(): "today" is always passed in, and all week math is
// date-only UTC so a late-evening local click never lands on the wrong week.
//
// This module owns the domain types (Leverage, TaskType, TimeAuditBlock,
// TimeAuditWeekResponse); src/lib/api.ts re-exports them so the API layer and
// the lib cannot drift apart.

export type Leverage = "Low" | "Low-Mid" | "Mid" | "Mid-High" | "High";

export type TaskType =
  | "Outreach"
  | "Sales calls"
  | "Roleplays"
  | "Scraping leads"
  | "Scrolling"
  | "Admin";

// One tagged block. An untagged block has no row and no object: there is no
// "empty" leverage, which is what keeps an untouched week honestly at $0.
export interface TimeAuditBlock {
  dayOfWeek: number; // 0 = Mon .. 6 = Sun
  slot: number; // 0 = 6:00 AM .. 31 = 9:30 PM
  leverage: Leverage;
  taskType: TaskType;
}

export interface TimeAuditWeekResponse {
  weekStart: string; // the Monday, "YYYY-MM-DD"
  blocks: TimeAuditBlock[]; // only tagged blocks
}

export interface LeverageTier {
  label: Leverage; // the stored enum value
  displayLabel: string; // what the legend shows ("Low/Mid")
  tint: string; // cell background
  solid: string; // cell rail + legend swatch edge
  ratePer30m: number; // dollars a half hour at this tier is worth
}

// Ordered low to high. Rates are Phase 1 constants (see plan 09, section 9: a
// settings surface to edit them is Phase 2).
export const LEVERAGE_TIERS: LeverageTier[] = [
  { label: "Low", displayLabel: "Low", tint: "#fdecec", solid: "#ef4444", ratePer30m: 0 },
  { label: "Low-Mid", displayLabel: "Low/Mid", tint: "#fdf3e2", solid: "#f59e0b", ratePer30m: 20 },
  { label: "Mid", displayLabel: "Mid", tint: "#e6f5fd", solid: "#0ea5e9", ratePer30m: 60 },
  { label: "Mid-High", displayLabel: "Mid/High", tint: "#eef0ff", solid: "#6366f1", ratePer30m: 160 },
  { label: "High", displayLabel: "High", tint: "#e7f7f0", solid: "#10b981", ratePer30m: 450 },
];

export interface TaskTypeConfig {
  label: TaskType;
  color: string;
  defaultLeverage: Leverage;
}

// Ordered as the click-to-cycle order (empty, then top of this list downward).
export const TASK_TYPES: TaskTypeConfig[] = [
  { label: "Sales calls", color: "#10b981", defaultLeverage: "High" },
  { label: "Roleplays", color: "#0ea5e9", defaultLeverage: "Mid-High" },
  { label: "Outreach", color: "#6366f1", defaultLeverage: "Mid" },
  { label: "Scraping leads", color: "#f59e0b", defaultLeverage: "Low-Mid" },
  { label: "Admin", color: "#8b93a3", defaultLeverage: "Low-Mid" },
  { label: "Scrolling", color: "#ef4444", defaultLeverage: "Low" },
];

// 6:00 AM through the block that ends at 10:00 PM.
export const SLOT_COUNT = 32;
export const START_HOUR = 6;

// Tiers that count toward "% of tagged time is high-leverage".
const HIGH_LEVERAGE: ReadonlySet<Leverage> = new Set<Leverage>(["Mid-High", "High"]);

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MS_PER_DAY = 86_400_000;

export function tierFor(leverage: Leverage): LeverageTier {
  return LEVERAGE_TIERS.find((t) => t.label === leverage) ?? LEVERAGE_TIERS[0];
}

export function taskFor(taskType: TaskType): TaskTypeConfig {
  return TASK_TYPES.find((t) => t.label === taskType) ?? TASK_TYPES[0];
}

export interface SlotLabel {
  text: string; // "6:30"
  ampm: "AM" | "PM";
  isHourStart: boolean; // true on the :00 rows, which get the heavier border
}

// The time-column label for a slot index.
export function slotLabel(slot: number): SlotLabel {
  const minutes = START_HOUR * 60 + slot * 30;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    text: `${hour12}:${minute === 0 ? "00" : "30"}`,
    ampm: hour24 >= 12 ? "PM" : "AM",
    isHourStart: minute === 0,
  };
}

// What a single tagged block is worth.
export function rateForBlock(block: TimeAuditBlock): number {
  return tierFor(block.leverage).ratePer30m;
}

export function dayTotal(blocks: TimeAuditBlock[], dayOfWeek: number): number {
  return blocks.reduce((sum, b) => (b.dayOfWeek === dayOfWeek ? sum + rateForBlock(b) : sum), 0);
}

export function weekTotal(blocks: TimeAuditBlock[]): number {
  return blocks.reduce((sum, b) => sum + rateForBlock(b), 0);
}

// Tagged hours per tier (each block is half an hour). Every tier is present so
// the legend can show a zero without special-casing.
export function hoursByLeverage(blocks: TimeAuditBlock[]): Record<Leverage, number> {
  const out = {} as Record<Leverage, number>;
  for (const tier of LEVERAGE_TIERS) out[tier.label] = 0;
  for (const b of blocks) out[b.leverage] = (out[b.leverage] ?? 0) + 0.5;
  return out;
}

// Share of TAGGED time (not of the week) spent at Mid-High or High, rounded.
// Nothing tagged means 0, never a divide-by-zero NaN on the page.
export function pctHighLeverage(blocks: TimeAuditBlock[]): number {
  if (blocks.length === 0) return 0;
  const high = blocks.filter((b) => HIGH_LEVERAGE.has(b.leverage)).length;
  return Math.round((high / blocks.length) * 100);
}

export interface WeekRollup {
  dayTotals: number[]; // 7 entries, Mon first
  weekTotal: number;
  pctHighLeverage: number;
  hoursByLeverage: Record<Leverage, number>;
}

// Everything the footer row and the rail tile need, in one pass of the data.
export function weekRollup(blocks: TimeAuditBlock[]): WeekRollup {
  const dayTotals = Array.from({ length: 7 }, (_, d) => dayTotal(blocks, d));
  return {
    dayTotals,
    weekTotal: weekTotal(blocks),
    pctHighLeverage: pctHighLeverage(blocks),
    hoursByLeverage: hoursByLeverage(blocks),
  };
}

// Click-to-tag: empty, then each task in TASK_TYPES order, then back to empty.
export function cycleTaskType(current: TaskType | null): TaskType | null {
  if (current === null) return TASK_TYPES[0].label;
  const idx = TASK_TYPES.findIndex((t) => t.label === current);
  if (idx < 0) return TASK_TYPES[0].label;
  return idx + 1 < TASK_TYPES.length ? TASK_TYPES[idx + 1].label : null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// A "YYYY-MM-DD" string, or a Date read by its LOCAL calendar day, becomes a
// date-only UTC timestamp. Reading a Date locally is deliberate: 11pm on the
// 15th is still the 15th to the person clicking, whatever UTC thinks.
function toUtcMs(date: Date | string): number {
  if (typeof date === "string") {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  }
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// The Monday of the week containing `date`, as "YYYY-MM-DD". Sunday belongs to
// the week that started six days earlier, matching the Mon..Sun grid.
export function mondayOf(date: Date | string): string {
  const ms = toUtcMs(date);
  const dow = new Date(ms).getUTCDay(); // 0 = Sun
  const backDays = dow === 0 ? 6 : dow - 1;
  return toIso(ms - backDays * MS_PER_DAY);
}

// Week nav. Pure UTC arithmetic, so DST changes cannot shift the day.
export function addWeeks(weekStart: string, n: number): string {
  return toIso(toUtcMs(weekStart) + n * 7 * MS_PER_DAY);
}

// The date of a day column, e.g. dayOfWeek 2 of "2026-07-13" is 2026-07-15.
export function dayOfWeekDate(weekStart: string, dayOfWeek: number): Date {
  return new Date(toUtcMs(weekStart) + dayOfWeek * MS_PER_DAY);
}

// The week pill label: "Jul 13 – 19", or "Jun 29 – Jul 5" across a boundary.
export function formatWeekRange(weekStart: string): string {
  const start = new Date(toUtcMs(weekStart));
  const end = new Date(toUtcMs(weekStart) + 6 * MS_PER_DAY);
  const startLabel = `${MONTH_ABBR[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endLabel =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${end.getUTCDate()}`
      : `${MONTH_ABBR[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${startLabel} – ${endLabel}`;
}

// Whole dollars with thousands separators. Locale is pinned so the figure does
// not change shape between a dev machine and the worker.
export function money(v: number): string {
  return `$${v.toLocaleString("en-US")}`;
}
