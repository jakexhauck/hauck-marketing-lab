import type { SheetCall } from "../../functions/lib/salesSheetRows";

// The Sales Data sheet: its columns, its fills, its arithmetic.
//
// This page is a CLONE of the sales tracking sheet Jake works from, down to the
// fills. Every colour below was sampled off that sheet's own rendered canvas, so
// none of them is an approximation and none of them should be nudged toward the
// app's palette to make the page match its neighbours. Looking like the sheet is
// the requirement.
//
// Kept pure and out of the component so the arithmetic a commission is argued
// over is unit-tested directly.
//
// WHAT THIS PAGE DOES NOT DO IS INVENT. Seven columns have nowhere to read from
// yet (who set the call, who closed it, how it was paid, the recording). They
// render as blank cells and unset dropdowns in the right fill rather than as
// plausible-looking values, and they get their sources in the wiring pass.

// The agency's share of the cash taken on a call.
//
// The sheet split cash four ways: setter 5%, closer 10%, agency 20%, creator
// 65%, all of it after a 3.25% processing fee. Jake sets and closes every call
// himself and does not know the processing fee, so the setter, closer, creator
// and after-fees columns are gone and this is the only rate left. It keeps the
// sheet's own 20% until Jake says otherwise.
//
// ONE constant, on purpose: it moves into a settings panel in the wiring pass,
// and a rate copied into two files is a rate that will disagree with itself.
export const AGENCY_PAY_RATE = 0.2;

// ===== fills, sampled off the sheet =====

const ROSE = "#e6b8af";
const GREEN = "#93c47d";
const PURPLE = "#d9d2e9";
const PEACH = "#fce5cd";
const WHITE = "#ffffff";
const YELLOW = "#fff2cc";
const BLUE = "#cfe2f3";
const PINK = "#ead1dc";
const MAUVE = "#d5a6bd";
const STEEL = "#9fc5e8";
const PALE_GREEN = "#d9ead3";
const GREY = "#d9d9d9";
const BLACK = "#000000";
// The four rate cells sit on a grey label and a loud value.
const RATE_LABEL = "#cccccc";
const RATE_GOOD = "#00ff00";
const RATE_BAD = "#e06666";
// The divider between the summary band and the table.
export const SHEET_RULE = "#980000";

// The dropdown chips.
const CHIP_LIGHT_GREEN = "#d4edbc";
const CHIP_DARK_GREEN = "#11734b";
// The unset dropdown. Exported because the component paints it in CSS, and a
// fill copied into two files is a fill that will disagree with itself.
export const CHIP_EMPTY = "#e8eaed";

// ===== the column schema =====

export interface SheetColumn {
  key: string;
  label: string;
  headerFill: string;
  bodyFill: string;
  // White header text on the two black columns.
  headerInk?: string;
  align?: "left" | "right";
  // How much of the table's width this column takes, RELATIVE to its
  // neighbours, not in pixels. The whole sheet has to be readable without
  // scrolling sideways, so the table is fluid: the component turns these into
  // percentages that always sum to 100. A pixel width here would be a promise
  // about a screen size nobody made.
  weight: number;
}

// Table order is the sheet's order, minus the columns Jake struck off: Setter
// Pay, Closer Pay, Creator Pay, Cash Collected After Fees, and the Avg Close
// rate column that was already hidden in the sheet.
// The date carries the longest string on the sheet by far ("Monday, March 9,
// 2026 11:30 AM - EDT"), so it takes roughly twice a plain column. Everything
// else is weighted by how much its longest real value needs.
export const SHEET_COLUMNS: SheetColumn[] = [
  { key: "apptDate", label: "Appointment Date", headerFill: ROSE, bodyFill: ROSE, weight: 195 },
  { key: "postCallForm", label: "Post Call Form", headerFill: ROSE, bodyFill: ROSE, weight: 88 },
  // "DON'T TOUCH" is the sheet's own wording, kept because it is what Jake
  // reads. Black column, white header text, exactly as the sheet has it.
  {
    key: "closer",
    label: "Assigned Closer (DON'T TOUCH)",
    headerFill: BLACK,
    bodyFill: BLACK,
    headerInk: "#ffffff",
    weight: 100,
  },
  { key: "setBy", label: "Set By", headerFill: BLACK, bodyFill: BLACK, headerInk: "#ffffff", weight: 82 },
  { key: "name", label: "Name", headerFill: PURPLE, bodyFill: PURPLE, weight: 112 },
  { key: "closed", label: "Closed", headerFill: PEACH, bodyFill: PEACH, weight: 92 },
  { key: "calls", label: "Calls", headerFill: WHITE, bodyFill: WHITE, weight: 94 },
  { key: "revenue", label: "Revenue", headerFill: YELLOW, bodyFill: YELLOW, weight: 92 },
  { key: "paymentType", label: "Payment Type", headerFill: BLUE, bodyFill: BLUE, weight: 88 },
  { key: "cashCollected", label: "Cash Collected", headerFill: BLUE, bodyFill: BLUE, weight: 95 },
  { key: "paymentsComplete", label: "Payments Complete", headerFill: BLUE, bodyFill: BLUE, weight: 96 },
  { key: "objection", label: "Objection", headerFill: BLUE, bodyFill: BLUE, weight: 96 },
  { key: "needsFollowUp", label: "Needs Follow-up", headerFill: PINK, bodyFill: PINK, weight: 92 },
  { key: "callNotes", label: "Call Notes", headerFill: MAUVE, bodyFill: MAUVE, weight: 110 },
  { key: "recordingLink", label: "Call Recording Link", headerFill: STEEL, bodyFill: STEEL, weight: 96 },
  // The one pay column left. Header takes the blue band, body the pale green,
  // as every pay column in the sheet does.
  {
    key: "agencyPay",
    label: "Agency Pay",
    headerFill: BLUE,
    bodyFill: PALE_GREEN,
    align: "right",
    weight: 92,
  },
  { key: "paymentStatus", label: "Payment Status", headerFill: GREY, bodyFill: GREY, weight: 96 },
];

// Each column's share of the table, as a CSS percentage. The table is fluid, so
// the seventeen columns always add up to the width available and the whole
// sheet is readable without scrolling sideways.
export function columnWidths(): string[] {
  const total = SHEET_COLUMNS.reduce((sum, c) => sum + c.weight, 0);
  return SHEET_COLUMNS.map((c) => `${((c.weight / total) * 100).toFixed(4)}%`);
}

// ===== the summary band =====

export interface BandTotals {
  revenue: number;
  cashCollected: number;
  // Everything booked that was not called off.
  totalCalls: number;
  // Called off on the calendar before it happened. Counted apart from
  // totalCalls, not inside it: a meeting that never ran is a booking fact, and
  // letting it into the denominator drags every rate down invisibly.
  cancelled: number;
  // They turned up. The four buckets below partition this exactly once each.
  liveCalls: number;
  noShows: number;
  unqualified: number;
  noClose: number;
  followUp: number;
  closed: number;
  agencyPay: number;
  closingRate: number;
  noShowRate: number;
}

export interface BandCell {
  // The column this cell sits over. The band rides the table's own grid, as it
  // does in the sheet, so the two can never fall out of alignment.
  key: string;
  label: string;
  value: (t: BandTotals) => string;
  labelFill: string;
  valueFill: string;
  // The four big bold rate cells.
  emphasis?: boolean;
}

const NOTHING = () => "";

// Rows 1 and 2 of the sheet, over the same seventeen columns.
//
// Gone with the columns that fed them: CC After Fees, and the four per-person
// pay totals for the two setters and two closers. name (operator) is the one
// left, and it totals Agency Pay.
export const BAND_CELLS: BandCell[] = [
  { key: "apptDate", label: "", value: NOTHING, labelFill: ROSE, valueFill: ROSE },
  {
    key: "postCallForm",
    label: "Revenue",
    value: (t) => formatSheetMoney(t.revenue),
    labelFill: GREEN,
    valueFill: GREEN,
  },
  {
    key: "closer",
    label: "Cash Collected",
    value: (t) => formatSheetMoney(t.cashCollected),
    labelFill: GREEN,
    valueFill: GREEN,
  },
  // The sheet's own two-word label column: "Calls:" over "Calls Booked:".
  { key: "setBy", label: "Calls:", value: () => "Calls Booked:", labelFill: PURPLE, valueFill: PURPLE },
  {
    key: "name",
    label: "Total Calls",
    value: (t) => String(t.totalCalls),
    labelFill: PEACH,
    valueFill: PEACH,
  },
  {
    key: "closed",
    label: "Live Calls",
    value: (t) => String(t.liveCalls),
    labelFill: WHITE,
    valueFill: WHITE,
  },
  {
    key: "calls",
    label: "Calls Cancelled",
    value: (t) => String(t.cancelled),
    labelFill: YELLOW,
    valueFill: YELLOW,
  },
  {
    key: "revenue",
    label: "No Shows",
    value: (t) => String(t.noShows),
    labelFill: YELLOW,
    valueFill: YELLOW,
  },
  // The four things a live call becomes, in the order they get worse to best.
  // Together they add up to Live Calls exactly, so nothing is double-counted
  // and nothing falls through a gap.
  {
    key: "paymentType",
    label: "Unqualified",
    value: (t) => String(t.unqualified),
    labelFill: BLUE,
    valueFill: BLUE,
  },
  {
    key: "cashCollected",
    label: "No-Close",
    value: (t) => String(t.noClose),
    labelFill: BLUE,
    valueFill: BLUE,
  },
  {
    key: "paymentsComplete",
    label: "Follow-Up",
    value: (t) => String(t.followUp),
    labelFill: BLUE,
    valueFill: BLUE,
  },
  {
    key: "objection",
    label: "Closed",
    value: (t) => String(t.closed),
    labelFill: BLUE,
    valueFill: BLUE,
  },
  {
    key: "needsFollowUp",
    label: "Closing Rate (%)",
    value: (t) => formatSheetPct(t.closingRate),
    labelFill: RATE_LABEL,
    valueFill: RATE_GOOD,
    emphasis: true,
  },
  {
    key: "callNotes",
    label: "No Show Rate (%)",
    value: (t) => formatSheetPct(t.noShowRate),
    labelFill: RATE_LABEL,
    valueFill: RATE_BAD,
    emphasis: true,
  },
  { key: "recordingLink", label: "", value: NOTHING, labelFill: BLUE, valueFill: BLUE },
  {
    key: "agencyPay",
    label: "name (operator)",
    value: (t) => formatSheetMoney(t.agencyPay),
    labelFill: BLUE,
    valueFill: BLUE,
  },
  { key: "paymentStatus", label: "", value: NOTHING, labelFill: BLUE, valueFill: BLUE },
];

// A rate with no denominator is 0, not null.
//
// The old day grid rendered a dash there, on the argument that a rate over
// nothing is not a measurement. The sheet prints 0.00%, and the sheet is the
// spec on this page: a band whose cells sometimes hold a dash would not look
// like the thing being cloned.
function rate(top: number, bottom: number): number {
  return bottom > 0 ? top / bottom : 0;
}

export function bandTotals(calls: SheetCall[]): BandTotals {
  let revenue = 0;
  let cashCollected = 0;
  let cancelled = 0;
  let totalCalls = 0;
  let liveCalls = 0;
  let noShows = 0;
  let unqualified = 0;
  let noClose = 0;
  let followUp = 0;
  let closed = 0;

  for (const c of calls) {
    revenue += c.revenue ?? 0;
    cashCollected += c.cashCollected ?? 0;

    // A meeting called off in advance was never a call. It gets its own count
    // rather than joining the others: counting it as a call would drag every
    // rate on the band down for a reason nobody reading it can see.
    if (c.cancelled) {
      cancelled += 1;
      continue;
    }

    totalCalls += 1;
    if (c.noShow) noShows += 1;
    if (!c.showed) continue;

    liveCalls += 1;
    if (c.closed) closed += 1;
    if (c.needsFollowUp) followUp += 1;
    if (c.noClose) noClose += 1;
    if (c.unqualified) unqualified += 1;
  }

  return {
    revenue,
    cashCollected,
    cancelled,
    totalCalls,
    liveCalls,
    noShows,
    unqualified,
    noClose,
    followUp,
    closed,
    agencyPay: cashCollected * AGENCY_PAY_RATE,
    // Over the calls that HAPPENED, not over the calendar: a month of no-shows
    // is a booking problem, and charging it to the close rate hides which.
    closingRate: rate(closed, liveCalls),
    noShowRate: rate(noShows, totalCalls),
  };
}

// The band's cells, formatted, keyed by the column each sits over.
export function bandValues(totals: BandTotals): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cell of BAND_CELLS) out[cell.key] = cell.value(totals);
  return out;
}

// ===== one row =====

export type SheetCellValue =
  | { kind: "text"; text: string }
  | { kind: "chip"; text: string; fill: string; ink: string }
  // An unset dropdown, which is what these cells look like in the sheet. Shown
  // rather than left blank: a column that will be filled in later should look
  // like it is waiting, not like it is broken.
  | { kind: "empty-chip" };

const EMPTY: SheetCellValue = { kind: "text", text: "" };
const EMPTY_CHIP: SheetCellValue = { kind: "empty-chip" };

function text(value: string): SheetCellValue {
  return { kind: "text", text: value };
}

export function sheetRow(call: SheetCall, timeZone: string): Record<string, SheetCellValue> {
  return {
    apptDate: text(formatApptDate(call.scheduledAt, timeZone)),
    // Nothing generates the per-contact form link yet.
    postCallForm: EMPTY,
    closer: EMPTY_CHIP,
    setBy: EMPTY_CHIP,
    name: text(call.name),
    closed: call.closed
      ? { kind: "chip", text: "Closed", fill: CHIP_LIGHT_GREEN, ink: CHIP_DARK_GREEN }
      : EMPTY,
    calls: callsCell(call),
    revenue: text(formatSheetMoney(call.revenue)),
    paymentType: EMPTY,
    cashCollected: text(formatSheetMoney(call.cashCollected)),
    paymentsComplete: EMPTY_CHIP,
    objection: text(call.objection),
    needsFollowUp: call.needsFollowUp
      ? { kind: "chip", text: "Yes", fill: CHIP_LIGHT_GREEN, ink: CHIP_DARK_GREEN }
      : EMPTY,
    callNotes: text(call.notes),
    recordingLink: EMPTY,
    agencyPay: text(
      call.cashCollected === null ? "" : formatSheetMoney(call.cashCollected * AGENCY_PAY_RATE),
    ),
    paymentStatus: EMPTY,
  };
}

// The sheet's Calls column: what became of the slot. Blank until somebody has
// recorded an outcome, because an un-recorded meeting is not a no-show.
function callsCell(call: SheetCall): SheetCellValue {
  if (call.showed) return { kind: "chip", text: "Live Call", fill: CHIP_DARK_GREEN, ink: "#ffffff" };
  if (call.noShow) return { kind: "chip", text: "No Show", fill: "#b10202", ink: "#ffffff" };
  return EMPTY;
}

// ===== formatting =====

// Always two decimals, as the sheet has it: $2,000.00, never $2,000.
export function formatSheetMoney(value: number | null): string {
  if (value === null || value === undefined) return "";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSheetPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// "Monday, March 9, 2026 11:30 AM - EDT", which is how the sheet writes it.
//
// In the AGENCY's timezone, not the reader's: two people opening the same month
// in different cities must see the same appointment on the same line.
export function formatApptDate(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(at));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const zone = get("timeZoneName");
  const clock = `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
  return `${get("weekday")}, ${get("month")} ${get("day")}, ${get("year")} ${clock} - ${zone}`;
}
