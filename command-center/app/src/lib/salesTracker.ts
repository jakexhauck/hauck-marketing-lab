// The Sales Data column schema and its rate math: the surface-specific half of
// the shared daily-funnel tracker (the generic month/rollup engine is in
// ./trackerMonth, the view is components/admin/tracker/DailyTracker).
//
// THE GRID IS A REPORT, NOT A FORM. Every count here is derived from the
// meetings themselves (functions/lib/salesDataRollup.ts, one row per meeting in
// public.sales_calls). It used to be typed by hand, which meant the same month
// had two answers: the one somebody counted and the one the outcomes on Sales
// Calls already knew. Nothing on this page can be typed any more, so the two
// can no longer disagree.
//
// Kept pure and out of the component so the four rates that describe how the
// agency actually sells can be unit-tested directly. Nothing here invents a
// number: every rate divides two counts that came off real meetings, and a rate
// whose denominator is 0 is null (rendered "-"), never a flattering 0%.

import type { TrackerColumn, RollupCells } from "../components/admin/tracker/DailyTracker";
import type { DerivedSalesDay } from "../../functions/lib/salesDataRollup";
import { pct, formatPct, formatNum, safeDivide } from "./trackerMonth";

// The numeric columns, which is what the footer totals and averages.
export const SALES_NUMERIC_FIELDS = [
  "onCalendar",
  "cancelled",
  "awaiting",
  "taken",
  "qualified",
  "closed",
  "cash",
] as const;

export type SalesNumericField = (typeof SALES_NUMERIC_FIELDS)[number];

// Table order: each computed rate sits immediately right of the count that
// produces it, so the funnel reads left to right (on the calendar -> taken ->
// qualified -> closed -> cash).
//
// Every column is "computed": the shared tracker renders a computed cell as
// read-only text, which is exactly what a derived grid is. No column is
// "input", so there is nothing on this page to type into.
export const SALES_COLUMNS: TrackerColumn[] = [
  { key: "onCalendar", label: "On Calendar", kind: "computed" },
  { key: "cancelled", label: "Cancelled", kind: "computed" },
  // Meetings whose outcome nobody has recorded. It sits BEFORE Taken on
  // purpose: it is the reason a day's Taken can be lower than its calendar, and
  // reading it after the rates would be finding out too late.
  { key: "awaiting", label: "Awaiting", kind: "computed" },
  { key: "taken", label: "Taken", kind: "computed" },
  { key: "showUpPct", label: "Show-Up %", kind: "computed" },
  { key: "qualified", label: "Qualified", kind: "computed" },
  { key: "qualifiedPct", label: "Qual %", kind: "computed" },
  { key: "closed", label: "Closed", kind: "computed" },
  { key: "closePct", label: "Close %", kind: "computed" },
  { key: "closeFromQualifiedPct", label: "Close % (Qual)", kind: "computed" },
  { key: "cash", label: "Cash", kind: "computed" },
  // Who the day's meetings were with, so a number on this row can be traced to
  // a name without opening another page.
  { key: "names", label: "Meetings", kind: "computed" },
];

// One day's counts, as the table holds them.
export interface SalesCounts {
  onCalendar: number;
  cancelled: number;
  awaiting: number;
  // Meetings with an outcome recorded. Not a column of its own (it is
  // onCalendar minus cancelled minus awaiting), but it is the denominator for
  // show-up %, so it is carried rather than re-derived at each use.
  decided: number;
  taken: number;
  qualified: number;
  closed: number;
  cash: number;
}

// The four rates. null means "no denominator yet", not zero.
export interface SalesRates {
  showUpPct: number | null;
  qualifiedPct: number | null;
  closePct: number | null;
  closeFromQualifiedPct: number | null;
}

export function emptyCounts(): SalesCounts {
  return {
    onCalendar: 0,
    cancelled: 0,
    awaiting: 0,
    decided: 0,
    taken: 0,
    qualified: 0,
    closed: 0,
    cash: 0,
  };
}

// The funnel, in one place.
//   Show-Up %   taken / DECIDED, not / on the calendar. A meeting nobody has
//               recorded yet is not a no-show, and dividing by the whole
//               calendar would quietly count it as one. This is the same rule
//               the Sales Calls funnel uses (functions/lib/salesCalls.ts:
//               showRate), which is what makes the two pages agree.
//   Qualified % qualified / taken
//   Close %     closed / taken       (close rate over everyone who turned up)
//   Close % Q   closed / qualified   (close rate once qualified)
export function salesRates(counts: SalesCounts): SalesRates {
  return {
    showUpPct: pct(counts.taken, counts.decided),
    qualifiedPct: pct(counts.qualified, counts.taken),
    closePct: pct(counts.closed, counts.taken),
    closeFromQualifiedPct: pct(counts.closed, counts.qualified),
  };
}

// A derived day -> the counts the table reads. Kept as its own step so the
// wire shape and the table's shape can move independently.
export function countsFor(day: DerivedSalesDay): SalesCounts {
  return {
    onCalendar: day.onCalendar,
    cancelled: day.cancelled,
    awaiting: day.awaiting,
    decided: day.decided,
    taken: day.taken,
    qualified: day.qualified,
    closed: day.closed,
    cash: day.cash,
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

// The day's meetings as one cell: "Acme Roofing, Baker Co". Truncated with a
// count rather than running the column off the page.
const NAMES_SHOWN = 2;

export function formatNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length <= NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, NAMES_SHOWN).join(", ")} +${names.length - NAMES_SHOWN}`;
}

// A day is "logged" if a meeting sat on the calendar for it. Averages divide by
// this count, so a weekend with no selling on it never drags the per-day
// average down.
export function isDayWorked(counts: SalesCounts): boolean {
  return counts.onCalendar > 0;
}

// The computed cells for one table row. A day with no meetings on it renders
// entirely blank: an empty row is an honest "nothing was booked", where a row of
// zeroes reads like a day that was worked and produced nothing.
export function computeSalesRow(day: DerivedSalesDay | null): RollupCells {
  if (!day || day.onCalendar === 0) {
    const blank: RollupCells = {};
    for (const c of SALES_COLUMNS) blank[c.key] = "";
    return blank;
  }

  const counts = countsFor(day);
  const rates = salesRates(counts);
  return {
    onCalendar: formatNum(counts.onCalendar),
    // Zero is left blank on the two columns that are exceptions rather than
    // measurements: a day with nothing cancelled and nothing outstanding should
    // read as a clean day, not as two zeroes to scan past.
    cancelled: counts.cancelled ? formatNum(counts.cancelled) : "",
    awaiting: counts.awaiting ? formatNum(counts.awaiting) : "",
    taken: formatNum(counts.taken),
    showUpPct: formatPct(rates.showUpPct),
    qualified: formatNum(counts.qualified),
    qualifiedPct: formatPct(rates.qualifiedPct),
    closed: formatNum(counts.closed),
    closePct: formatPct(rates.closePct),
    closeFromQualifiedPct: formatPct(rates.closeFromQualifiedPct),
    cash: counts.cash ? formatMoney(counts.cash) : "",
    names: formatNames(day.names),
  };
}

export interface SalesRollup {
  average: RollupCells;
  total: RollupCells;
  // The month's totals and month-to-date rates, for the stat tiles.
  totals: SalesCounts;
  rates: SalesRates;
  // Days that had at least one meeting on the calendar.
  workedDays: number;
}

// The sticky footer plus everything the stat tiles need.
//
// The rate cells on the Total row are computed from the month's TOTALS, not
// averaged across days: a 1-meeting day that closed 1 and a 10-meeting day that
// closed 4 are not each "worth" the same close rate. The Average row leaves the
// rate columns blank rather than print a second, subtly different number next
// to them.
export function computeSalesRollup(days: DerivedSalesDay[]): SalesRollup {
  const counts = days.map(countsFor);
  const workedDays = counts.filter(isDayWorked).length;

  const totals = emptyCounts();
  for (const c of counts) {
    totals.onCalendar += c.onCalendar;
    totals.cancelled += c.cancelled;
    totals.awaiting += c.awaiting;
    totals.decided += c.decided;
    totals.taken += c.taken;
    totals.qualified += c.qualified;
    totals.closed += c.closed;
    totals.cash += c.cash;
  }

  const average: RollupCells = {};
  const total: RollupCells = {};
  for (const field of SALES_NUMERIC_FIELDS) {
    const sum = totals[field];
    const money = field === "cash";
    // Per WORKED day, not per calendar day: dividing a month's meetings by 31
    // describes a diary, not a sales week.
    const mean = safeDivide(sum, workedDays);
    average[field] = money ? (mean === null ? "" : formatMoney(mean)) : formatNum(mean, 1);
    total[field] = money ? formatMoney(sum) : formatNum(sum);
  }

  const rates = salesRates(totals);
  total.showUpPct = formatPct(rates.showUpPct);
  total.qualifiedPct = formatPct(rates.qualifiedPct);
  total.closePct = formatPct(rates.closePct);
  total.closeFromQualifiedPct = formatPct(rates.closeFromQualifiedPct);

  return { average, total, totals, rates, workedDays };
}
