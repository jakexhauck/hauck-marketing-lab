// Pure helpers for the Cold SMS sheet pages (Acquisition > Cold SMS). Those
// pages copy the SMS Tracking tab of the Master Data Tracker Google Sheet cell
// for cell (Jake, 2026-10-01), so the day list, the labels and the number
// formats here are the sheet's, not the rest of the app's.
//
// Dates are handled as UTC calendar days so a browser's timezone can never
// shift a row onto the wrong date.

import { MONTH_NAMES } from "./trackerMonth";

// The sheet's first row is 10/1/26 and its daily table runs 190 rows from it.
export const SHEET_START = "2026-10-01";
const SHEET_ROWS = 190;
// Once today passes the sheet's last row, keep this many days of empty rows
// ahead so there is always somewhere to type.
const DAYS_AHEAD = 30;
// The sheet's monthly table has six rows, October onward.
const SHEET_MONTH_ROWS = 6;

// The sheet's weekday column: one letter, so Tuesday and Thursday are both T.
const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export interface SheetDay {
  iso: string; // "2026-10-01"
  month: string; // "2026-10", the daily API's month key
  dow: string; // "T"
  label: string; // "10/1/26"
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d ?? 1));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

// Every day from start to end inclusive, labelled like the sheet.
export function sheetDays(startIso: string, endIso: string): SheetDay[] {
  const out: SheetDay[] = [];
  const end = parseIso(endIso).getTime();
  for (let d = parseIso(startIso); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = toIso(d);
    out.push({
      iso,
      month: iso.slice(0, 7),
      dow: DOW_LETTERS[d.getUTCDay()],
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`,
    });
  }
  return out;
}

// The daily table's last row: the sheet's 190 rows, or a month past today,
// whichever is later.
export function sheetDailyEnd(todayIso: string): string {
  const sheetEnd = addDays(SHEET_START, SHEET_ROWS - 1);
  const ahead = addDays(todayIso, DAYS_AHEAD);
  return ahead > sheetEnd ? ahead : sheetEnd;
}

// Every "YYYY-MM" from start's month to end's month inclusive.
export function monthsBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let [y, m] = startIso.slice(0, 7).split("-").map(Number);
  const last = endIso.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// The monthly table's rows: the sheet's six from October 2026, every month up
// to the current one, and any older month that already has data.
export function sheetMonths(dataMonths: string[], todayIso: string): string[] {
  const sixth = monthsBetween(SHEET_START, "2100-01")[SHEET_MONTH_ROWS - 1];
  const through = todayIso.slice(0, 7) > sixth ? todayIso.slice(0, 7) : sixth;
  const all = new Set([
    ...monthsBetween(SHEET_START, through),
    ...dataMonths.map((m) => m.slice(0, 7)),
  ]);
  return [...all].sort();
}

// "2026-10" or "2026-10-01" -> "October 2026".
export function sheetMonthLabel(month: string): string {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// The sheet's percentage format, two decimals. Blank where the sheet shows
// #DIV/0!, so an empty row reads as empty.
export function sheetPct(value: number | null): string {
  return value === null ? "" : `${value.toFixed(2)}%`;
}
