// The Sales Data column schema and its rate math: the surface-specific half of
// the shared daily-funnel tracker (the generic month/rollup engine is in
// ./trackerMonth, the view is components/admin/tracker/DailyTracker).
//
// Kept pure and out of the component so the four rates that describe how the
// agency actually sells can be unit-tested directly. Nothing here invents a
// number: every rate divides two counts a human typed, and a rate whose
// denominator is 0 is null (rendered "-"), never a flattering 0%.
//
// The column keys are the API's camelCase field names on purpose, so a cell edit
// carries straight through to the PATCH body with no second mapping to keep in
// sync.

import type {
  TrackerColumn,
  TrackerRow,
  RollupCells,
} from "../components/admin/tracker/DailyTracker";
import {
  toInt,
  pct,
  formatPct,
  formatNum,
  rollupColumn,
  countFilledDays,
} from "./trackerMonth";

// The fields a human types, in table order. Everything else on the row is
// derived.
export const SALES_INPUT_FIELDS = [
  "callsOnCalendar",
  "rescheduledCancelled",
  "callsTaken",
  "qualified",
  "closed",
  "cashCollected",
  "notes",
] as const;

// The numeric ones, which is what the footer totals and averages.
export const SALES_NUMERIC_FIELDS = [
  "callsOnCalendar",
  "rescheduledCancelled",
  "callsTaken",
  "qualified",
  "closed",
  "cashCollected",
] as const;

// Table order: each computed rate sits immediately right of the count that
// produces it, so the funnel reads left to right (booked -> showed -> qualified
// -> closed -> cash).
export const SALES_COLUMNS: TrackerColumn[] = [
  { key: "callsOnCalendar", label: "On Calendar", kind: "input" },
  { key: "rescheduledCancelled", label: "Resched / Cancel", kind: "input" },
  { key: "callsTaken", label: "Taken", kind: "input" },
  { key: "showUpPct", label: "Show-Up %", kind: "computed" },
  { key: "qualified", label: "Qualified", kind: "input" },
  { key: "qualifiedPct", label: "Qual %", kind: "computed" },
  { key: "closed", label: "Closed", kind: "input" },
  { key: "closePct", label: "Close %", kind: "computed" },
  { key: "closeFromQualifiedPct", label: "Close % (Qual)", kind: "computed" },
  { key: "cashCollected", label: "Cash", kind: "input" },
  { key: "notes", label: "Notes", kind: "text" },
];

// One day's typed counts, parsed.
export interface SalesCounts {
  callsOnCalendar: number;
  rescheduledCancelled: number;
  callsTaken: number;
  qualified: number;
  closed: number;
  cashCollected: number;
}

// The four rates. null means "no denominator yet", not zero.
export interface SalesRates {
  showUpPct: number | null;
  qualifiedPct: number | null;
  closePct: number | null;
  closeFromQualifiedPct: number | null;
}

// Parse a money cell as typed: tolerate "$4,500.00" the same way the endpoint
// does, so the live footer matches what gets stored.
export function toMoney(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function readCounts(row: TrackerRow): SalesCounts {
  return {
    callsOnCalendar: toInt(row.callsOnCalendar),
    rescheduledCancelled: toInt(row.rescheduledCancelled),
    callsTaken: toInt(row.callsTaken),
    qualified: toInt(row.qualified),
    closed: toInt(row.closed),
    cashCollected: toMoney(row.cashCollected),
  };
}

// The funnel, in one place.
//   Show-Up %   calls taken / calls on the calendar
//   Qualified % qualified / calls taken
//   Close %     closed / calls taken            (overall close rate)
//   Close % Q   closed / qualified              (close rate once qualified)
export function salesRates(counts: SalesCounts): SalesRates {
  return {
    showUpPct: pct(counts.callsTaken, counts.callsOnCalendar),
    qualifiedPct: pct(counts.qualified, counts.callsTaken),
    closePct: pct(counts.closed, counts.callsTaken),
    closeFromQualifiedPct: pct(counts.closed, counts.qualified),
  };
}

// Money for display. Whole dollars stay whole (a table of "$4,500.00" is noise);
// anything with cents keeps them.
export function formatMoney(value: number | null): string {
  if (value === null) return "-";
  // All or nothing on the decimals: a bare minimumFractionDigits: 0 renders
  // 4500.5 as "$4,500.5", which reads as a typo rather than as money.
  const digits = Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// A day is "logged" if any numeric cell has something in it. Averages divide by
// this count, so an unworked weekend never drags the per-day average down.
export function isSalesRowFilled(row: TrackerRow): boolean {
  return SALES_NUMERIC_FIELDS.some((f) => String(row[f] ?? "").trim() !== "");
}

// The computed cells for one table row.
export function computeSalesRow(row: TrackerRow): RollupCells {
  const rates = salesRates(readCounts(row));
  return {
    showUpPct: formatPct(rates.showUpPct),
    qualifiedPct: formatPct(rates.qualifiedPct),
    closePct: formatPct(rates.closePct),
    closeFromQualifiedPct: formatPct(rates.closeFromQualifiedPct),
  };
}

export interface SalesRollup {
  average: RollupCells;
  total: RollupCells;
  // The month's totals and month-to-date rates, for the stat tiles.
  totals: SalesCounts;
  rates: SalesRates;
  filledDays: number;
}

// The sticky footer plus everything the stat tiles need.
//
// The rate cells on the Total row are computed from the month's TOTALS, not
// averaged across days: a 4-call day that closed 1 and a 40-call day that closed
// 4 are not each "worth" the same close rate. The Average row leaves the rate
// columns blank rather than print a second, subtly different number next to
// them.
export function computeSalesRollup(rows: TrackerRow[]): SalesRollup {
  const counts = rows.map(readCounts);
  const filledDays = countFilledDays(rows, isSalesRowFilled);

  const average: RollupCells = {};
  const total: RollupCells = {};

  for (const field of SALES_NUMERIC_FIELDS) {
    const roll = rollupColumn(
      counts.map((c) => c[field]),
      filledDays,
    );
    const money = field === "cashCollected";
    average[field] = money
      ? formatMoney(roll.average)
      : formatNum(roll.average, 1);
    total[field] = money ? formatMoney(roll.total) : formatNum(roll.total);
  }

  const totals: SalesCounts = {
    callsOnCalendar: counts.reduce((s, c) => s + c.callsOnCalendar, 0),
    rescheduledCancelled: counts.reduce((s, c) => s + c.rescheduledCancelled, 0),
    callsTaken: counts.reduce((s, c) => s + c.callsTaken, 0),
    qualified: counts.reduce((s, c) => s + c.qualified, 0),
    closed: counts.reduce((s, c) => s + c.closed, 0),
    cashCollected: counts.reduce((s, c) => s + c.cashCollected, 0),
  };
  const rates = salesRates(totals);

  total.showUpPct = formatPct(rates.showUpPct);
  total.qualifiedPct = formatPct(rates.qualifiedPct);
  total.closePct = formatPct(rates.closePct);
  total.closeFromQualifiedPct = formatPct(rates.closeFromQualifiedPct);

  return { average, total, totals, rates, filledDays };
}
