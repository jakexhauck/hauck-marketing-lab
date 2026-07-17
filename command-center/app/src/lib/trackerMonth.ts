// Pure month + rate helpers behind the daily-funnel tracker (Cold Call, Cold
// SMS daily, Sales Data, and Ad Tracking's day grid all build on this). No
// React, no router, no Date.now(): "today" is always injected so the whole
// thing is deterministic and unit-testable.
//
// One row per calendar day. A month view auto-generates every day (weekend and
// today flagged); editing a cell writes that day's row; rates and rollups are
// computed from the raw counts, never fabricated.

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A month position. `month` is 0-based (0 = January) to match JS Date.
export interface MonthCursor {
  year: number;
  month: number;
}

// The concrete "today" the caller injects (0-based month), or null off-app.
export interface TodayRef {
  year: number;
  month: number;
  day: number;
}

// One generated day row in the month grid.
export interface MonthDay {
  day: number; // 1..31
  iso: string; // "YYYY-MM-DD" — the persistence key (one row per day)
  dow: number; // 0 = Sun .. 6 = Sat
  dowLabel: string; // "Mon"
  isWeekend: boolean;
  isToday: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Days in a (year, 0-based month). Day 0 of the next month is the last of this.
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// "July 2026" for the month nav label.
export function monthLabel(cursor: MonthCursor): string {
  return `${MONTH_NAMES[cursor.month]} ${cursor.year}`;
}

// Every day of the month, with weekend + today flags. `today` is injected so
// callers pass the real date and tests pass a fixed one.
export function buildMonthDays(
  cursor: MonthCursor,
  today: TodayRef | null = null,
): MonthDay[] {
  const total = daysInMonth(cursor.year, cursor.month);
  const days: MonthDay[] = [];
  for (let day = 1; day <= total; day++) {
    const dow = new Date(cursor.year, cursor.month, day).getDay();
    days.push({
      day,
      iso: `${cursor.year}-${pad2(cursor.month + 1)}-${pad2(day)}`,
      dow,
      dowLabel: DOW_LABELS[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday:
        !!today &&
        today.year === cursor.year &&
        today.month === cursor.month &&
        today.day === day,
    });
  }
  return days;
}

// Month nav. Wrap the year at the boundaries.
export function prevMonth(cursor: MonthCursor): MonthCursor {
  return cursor.month === 0
    ? { year: cursor.year - 1, month: 11 }
    : { year: cursor.year, month: cursor.month - 1 };
}

export function nextMonth(cursor: MonthCursor): MonthCursor {
  return cursor.month === 11
    ? { year: cursor.year + 1, month: 0 }
    : { year: cursor.year, month: cursor.month + 1 };
}

// The cursor for a given "today" (drops the day) — powers the Today button.
export function cursorForToday(today: TodayRef): MonthCursor {
  return { year: today.year, month: today.month };
}

// Parse a raw cell value to a non-negative integer; blank / garbage -> 0.
export function toInt(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

// A percentage, or null when the denominator is 0 (never divide-by-zero, never
// a fake 0%). e.g. pct(21, 131) -> 16.03...
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

// A ratio, or null when the denominator is 0.
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}

// Render a percentage: a plain "-" when null (matches the app's empty-value
// convention, no em dash), else "16.0%".
export function formatPct(value: number | null, digits = 1): string {
  if (value === null) return "-";
  return `${value.toFixed(digits)}%`;
}

// Render a plain number, "-" when null.
export function formatNum(value: number | null, digits = 0): string {
  if (value === null) return "-";
  return value.toFixed(digits);
}

// A per-column month rollup: the MTD total and the per-day average. The average
// divides by `filledDays` (days with any input), not the calendar length, so an
// unlogged weekend never drags the average down.
export interface ColumnRollup {
  total: number;
  average: number | null;
}

// Sum a single numeric column and average it over the given filled-day count.
export function rollupColumn(values: number[], filledDays: number): ColumnRollup {
  const total = values.reduce((sum, v) => sum + v, 0);
  return { total, average: safeDivide(total, filledDays) };
}

// Count the days a row is considered "logged": any of its input fields set.
export function countFilledDays<Row>(
  rows: Row[],
  isFilled: (row: Row) => boolean,
): number {
  return rows.reduce((count, row) => (isFilled(row) ? count + 1 : count), 0);
}
