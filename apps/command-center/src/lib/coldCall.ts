// Cold Call (Acquisition > Cold Call): the column schema, rate math and month
// rollups behind the daily dialing funnel. Pure, no React, no Date.now(): the
// surface owns state and injects today, this file only does arithmetic so it
// stays unit-tested.
//
// Rates are ALWAYS computed here and never stored (see migration 0031): a
// stored rate drifts from its inputs. Every rate goes through trackerMonth's
// pct/safeDivide, so a zero denominator yields null and renders as a plain "-",
// never NaN, Infinity or a fake 0%.
//
// Nothing here fabricates data: a month with no logged days shows "-" in the
// footer and the tiles rather than a manufactured 0.

import {
  countFilledDays,
  formatNum,
  formatPct,
  pct,
  rollupColumn,
  toInt,
  type ColumnRollup,
  type MonthCursor,
} from "./trackerMonth";
import type { ColdCallRow } from "./api";
import { formatObjections } from "../../functions/lib/coldCallDials";
import type {
  RollupCells,
  TrackerColumn,
  TrackerRow,
} from "../components/admin/tracker/DailyTracker";

// The four counts you type. Order matters: it drives the rollup maps.
export type ColdCallNumericField =
  | "callsMade"
  | "pickups"
  | "passThrough"
  | "meetingsBooked";

export const COLD_CALL_NUMERIC_FIELDS: ColdCallNumericField[] = [
  "callsMade",
  "pickups",
  "passThrough",
  "meetingsBooked",
];

// The two free-text cells. Never rolled up.
export type ColdCallTextField = "objections" | "notes";

export const COLD_CALL_TEXT_FIELDS: ColdCallTextField[] = ["objections", "notes"];

export type ColdCallField = ColdCallNumericField | ColdCallTextField;

export function isColdCallNumericField(field: string): field is ColdCallNumericField {
  return (COLD_CALL_NUMERIC_FIELDS as string[]).includes(field);
}

// The table, in the order the approved cold-calling.html mockup lays it out:
// each input followed by the rate it feeds.
export const COLD_CALL_COLUMNS: TrackerColumn[] = [
  { key: "callsMade", label: "Calls Made", kind: "input" },
  { key: "pickups", label: "Pickups", kind: "input" },
  { key: "pickupPct", label: "Pickup %", kind: "computed" },
  { key: "passThrough", label: "Pass-Through", kind: "input" },
  { key: "pickupToPtPct", label: "Pickup → PT %", kind: "computed" },
  { key: "meetingsBooked", label: "Meetings Booked", kind: "input" },
  { key: "pitchToBookPct", label: "Pitch → Book %", kind: "computed" },
  { key: "objections", label: "Objections", kind: "text" },
  { key: "notes", label: "Notes", kind: "text" },
];

// A blank day: the auto-generated template every unlogged day renders with.
export function emptyColdCallRow(): TrackerRow {
  return {
    callsMade: "",
    pickups: "",
    passThrough: "",
    meetingsBooked: "",
    objections: "",
    notes: "",
  };
}

// "YYYY-MM" for the ?month= query param.
export function monthParam(cursor: MonthCursor): string {
  const month = cursor.month + 1;
  return `${cursor.year}-${month < 10 ? `0${month}` : month}`;
}

// One count cell, resolved. Since 0052 a day can carry two numbers per column:
// what the app recorded from the outcome buttons, and what somebody typed over
// it. Typed wins, because the only reason to type is dialing the app could not
// see. A cell with neither stays blank rather than showing a fabricated 0.
function resolveCount(typed: number | null, recorded: number | null): string {
  if (typed !== null) return String(typed);
  if (recorded !== null) return String(recorded);
  return "";
}

// API rows -> the tracker's iso-keyed map of raw string cells.
export function toTrackerRows(days: ColdCallRow[]): Record<string, TrackerRow> {
  const byDay: Record<string, TrackerRow> = {};
  for (const d of days) {
    const rec = d.recorded;
    byDay[d.day] = {
      callsMade: resolveCount(d.callsMade, rec?.callsMade ?? null),
      pickups: resolveCount(d.pickups, rec?.pickups ?? null),
      passThrough: resolveCount(d.passThrough, rec?.passThrough ?? null),
      meetingsBooked: resolveCount(d.meetingsBooked, rec?.meetingsBooked ?? null),
      // Same rule as the numbers: what somebody typed wins, otherwise the
      // objections the app recorded from the Not Interested reasons.
      objections: d.objections ?? formatObjections(rec?.reasons),
      notes: d.notes ?? "",
    };
  }
  return byDay;
}

// Which cells are hand-typed, and what the app had recorded underneath. The grid
// marks these so nobody reads a typed figure as a measured one; the value is the
// recorded number that was overridden, or null when the app recorded nothing.
export type ColdCallTypedCells = Record<
  string,
  Partial<Record<ColdCallNumericField, number | null>>
>;

export function typedCells(days: ColdCallRow[]): ColdCallTypedCells {
  const out: ColdCallTypedCells = {};
  for (const d of days) {
    const cells: Partial<Record<ColdCallNumericField, number | null>> = {};
    for (const field of COLD_CALL_NUMERIC_FIELDS) {
      if (d[field] === null) continue;
      cells[field] = d.recorded ? d.recorded[field] : null;
    }
    if (Object.keys(cells).length > 0) out[d.day] = cells;
  }
  return out;
}

// The one-line explanation behind a typed cell, for its tooltip.
export function typedCellNote(label: string, recorded: number | null): string {
  return recorded === null
    ? `${label}: typed by hand. The app recorded no dialing this day.`
    : `${label}: typed by hand, over the ${recorded} the app recorded.`;
}

// What the app measured across a month, ignoring anything typed. The Scoreboard
// reports these separately from the grid's resolved numbers, since only these
// are un-inflatable.
export interface ColdCallRecordedTotals {
  callsMade: number;
  pickups: number;
  passThrough: number;
  meetingsBooked: number;
  // Days the app recorded at least one attempt on.
  days: number;
  // Days somebody typed at least one count into.
  typedDays: number;
}

export function recordedTotals(days: ColdCallRow[]): ColdCallRecordedTotals {
  const totals: ColdCallRecordedTotals = {
    callsMade: 0,
    pickups: 0,
    passThrough: 0,
    meetingsBooked: 0,
    days: 0,
    typedDays: 0,
  };
  for (const d of days) {
    if (d.recorded) {
      totals.callsMade += d.recorded.callsMade;
      totals.pickups += d.recorded.pickups;
      totals.passThrough += d.recorded.passThrough;
      totals.meetingsBooked += d.recorded.meetingsBooked;
      totals.days += 1;
    }
    if (COLD_CALL_NUMERIC_FIELDS.some((f) => d[f] !== null)) totals.typedDays += 1;
  }
  return totals;
}

// A day counts as logged when any of its four counts is set. Text-only notes do
// not make a day "logged": they would otherwise drag the per-day averages down.
export function isFilledColdCallDay(row: TrackerRow): boolean {
  return COLD_CALL_NUMERIC_FIELDS.some((f) => (row[f] ?? "").trim() !== "");
}

// One day's three rates, keyed to the computed columns above.
export function computeColdCallRow(row: TrackerRow): RollupCells {
  const calls = toInt(row.callsMade);
  const pickups = toInt(row.pickups);
  const passThrough = toInt(row.passThrough);
  const booked = toInt(row.meetingsBooked);

  return {
    pickupPct: formatPct(pct(pickups, calls)),
    pickupToPtPct: formatPct(pct(passThrough, pickups)),
    pitchToBookPct: formatPct(pct(booked, passThrough)),
  };
}

export interface ColdCallMonthRollup {
  // Days with at least one count entered. The average divides by this, not by
  // the calendar length, so unlogged weekends never skew it.
  filledDays: number;
  columns: Record<ColdCallNumericField, ColumnRollup>;
}

export function rollupColdCallMonth(rows: TrackerRow[]): ColdCallMonthRollup {
  const filledDays = countFilledDays(rows, isFilledColdCallDay);
  const columns = {} as Record<ColdCallNumericField, ColumnRollup>;
  for (const field of COLD_CALL_NUMERIC_FIELDS) {
    columns[field] = rollupColumn(
      rows.map((r) => toInt(r[field])),
      filledDays,
    );
  }
  return { filledDays, columns };
}

// The sticky footer. Both rows carry the same rate cells: a rate is a
// month-to-date ratio of the totals, which is the only honest reading of it
// (averaging per-day percentages would over-weight low-volume days).
export function coldCallFooter(rows: TrackerRow[]): {
  average: RollupCells;
  total: RollupCells;
} {
  const { filledDays, columns } = rollupColdCallMonth(rows);

  const rates: RollupCells = {
    pickupPct: formatPct(pct(columns.pickups.total, columns.callsMade.total)),
    pickupToPtPct: formatPct(pct(columns.passThrough.total, columns.pickups.total)),
    pitchToBookPct: formatPct(
      pct(columns.meetingsBooked.total, columns.passThrough.total),
    ),
  };

  // Nothing logged yet: state that, do not report a total of 0 dials.
  if (filledDays === 0) {
    const blank: RollupCells = { ...rates };
    for (const field of COLD_CALL_NUMERIC_FIELDS) blank[field] = "-";
    return { average: { ...blank }, total: { ...blank } };
  }

  return {
    average: {
      callsMade: formatNum(columns.callsMade.average),
      pickups: formatNum(columns.pickups.average),
      passThrough: formatNum(columns.passThrough.average),
      // Bookings are small numbers; a whole-number average hides the signal.
      meetingsBooked: formatNum(columns.meetingsBooked.average, 1),
      ...rates,
    },
    total: {
      callsMade: formatNum(columns.callsMade.total),
      pickups: formatNum(columns.pickups.total),
      passThrough: formatNum(columns.passThrough.total),
      meetingsBooked: formatNum(columns.meetingsBooked.total),
      ...rates,
    },
  };
}

// Everything the four stat tiles and the card subtitle display, as strings.
// The component only picks the icons and tones.
export interface ColdCallSummary {
  filledDays: number;
  subtitle: string;
  callsMade: string;
  pickupPct: string;
  pickupSub: string;
  meetingsBooked: string;
  // Bookings per dial (not per pitch): the tile answers "what does a dial buy".
  bookingPct: string;
  // Chip states, live off the benchmarks in the mockup.
  callsOnPace: boolean;
  pickupOnPace: boolean;
  bookingOnPace: boolean;
}

// Benchmarks from the approved mockup: 100 dials/day, 15% pickup, 1% booked.
const MIN_CALLS_PER_DAY = 100;
const MIN_PICKUP_PCT = 15;
const MIN_BOOKING_PCT = 1;

export function summarizeColdCallMonth(rows: TrackerRow[]): ColdCallSummary {
  const { filledDays, columns } = rollupColdCallMonth(rows);
  const calls = columns.callsMade.total;
  const pickups = columns.pickups.total;
  const booked = columns.meetingsBooked.total;

  const pickupRate = pct(pickups, calls);
  const bookingRate = pct(booked, calls);
  const logged = filledDays > 0;

  return {
    filledDays,
    subtitle: logged
      ? `${filledDays} ${filledDays === 1 ? "day" : "days"} logged this month`
      : "No days logged yet. Type into any row to start.",
    callsMade: logged ? formatNum(calls) : "-",
    pickupPct: formatPct(pickupRate),
    pickupSub: logged ? `${pickups} of ${calls}` : "no dials logged",
    meetingsBooked: logged ? formatNum(booked) : "-",
    bookingPct: formatPct(bookingRate),
    callsOnPace: (columns.callsMade.average ?? 0) >= MIN_CALLS_PER_DAY,
    pickupOnPace: (pickupRate ?? 0) >= MIN_PICKUP_PCT,
    bookingOnPace: (bookingRate ?? 0) >= MIN_BOOKING_PCT,
  };
}
