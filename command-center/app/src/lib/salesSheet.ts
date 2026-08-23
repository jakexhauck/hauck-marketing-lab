import type { SheetCall } from "../../functions/lib/salesSheetRows";

// Sales Data: the agency's own sales calls, a month at a time.
//
// This page was briefly a pixel copy of the Google sheet Jake worked from,
// fills and all. It is now the same information in the Command Center's own
// design: the sheet decided WHAT is worth showing, and the app decides how it
// looks. What that buys is a page that works in dark mode, reads at the app's
// type scale, and does not have seventeen columns of spreadsheet paint on it.
//
// Kept pure and out of the component so the arithmetic a commission is argued
// over is unit-tested directly.
//
// WHAT THIS PAGE DOES NOT DO IS INVENT. Three columns have nowhere to read
// from yet (how it was paid, the post-call form, the recording). They render as
// a faint dash rather than as plausible-looking values, and they get their
// sources when Jake wires them.

// ===== the table =====

export interface SheetColumn {
  key: string;
  label: string;
  // Numbers and money right-align on tabular figures, as every other table in
  // the app does, so a column of them can be scanned down rather than read.
  numeric?: boolean;
  // Share of the table's width RELATIVE to its neighbours, not pixels. The
  // table is fluid so the whole month fits the page it is given.
  weight: number;
}

// One row of the table. The three separate outcome columns the sheet carried
// (Closed, Calls, Needs Follow-up) are one Outcome pill here: they were
// mutually exclusive, so three columns to say one thing was three columns of
// mostly blank.
export const SHEET_COLUMNS: SheetColumn[] = [
  { key: "date", label: "Date", weight: 130 },
  { key: "name", label: "Name", weight: 120 },
  { key: "outcome", label: "Outcome", weight: 100 },
  { key: "revenue", label: "Revenue", numeric: true, weight: 90 },
  { key: "cashCollected", label: "Cash", numeric: true, weight: 90 },
  { key: "paymentType", label: "Payment Type", weight: 95 },
  { key: "objection", label: "Objection", weight: 100 },
  { key: "notes", label: "Notes", weight: 130 },
  { key: "postCallForm", label: "Post Call Form", weight: 95 },
  { key: "recordingLink", label: "Recording", weight: 85 },
];

// Each column's share of the table, as a CSS percentage, always summing to 100
// so the month fits the width available instead of running off the side.
export function columnWidths(): string[] {
  const total = SHEET_COLUMNS.reduce((sum, c) => sum + c.weight, 0);
  return SHEET_COLUMNS.map((c) => `${((c.weight / total) * 100).toFixed(4)}%`);
}

// ===== what a call became =====

export type Tone = "good" | "info" | "warn" | "bad" | "muted";

export interface OutcomePill {
  label: string;
  tone: Tone;
}

// The one thing a call is, in the order that decides it.
//
// Cancelled is read FIRST and no-show second, because both are facts about
// whether the meeting happened at all and they outrank anything recorded
// against it. A meeting nobody has recorded yet is "Awaiting": it is not a
// no-show, and showing it as one would invent a failure.
export function outcomeFor(call: SheetCall): OutcomePill {
  if (call.cancelled) return { label: "Cancelled", tone: "muted" };
  if (call.noShow) return { label: "No Show", tone: "bad" };
  if (call.closed) return { label: "Closed", tone: "good" };
  if (call.needsFollowUp) return { label: "Follow-Up", tone: "info" };
  if (call.noClose) return { label: "No-Close", tone: "warn" };
  if (call.unqualified) return { label: "Unqualified", tone: "muted" };
  return { label: "Awaiting", tone: "muted" };
}

// ===== the month, totalled =====

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
  // Null means "no denominator yet", not zero. A month with no calls in it did
  // not close 0% of them: there was nothing to close, and the two are different
  // facts. Rendered as a dash.
  closingRate: number | null;
  noShowRate: number | null;
}

// A rate with no denominator is null, not 0, and renders as a dash.
//
// Zero would read as a measured failure. A month with no calls in it did not
// close 0% of them; there was nothing to close, and the two are different facts.
function rate(top: number, bottom: number): number | null {
  return bottom > 0 ? top / bottom : null;
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
    // rate down for a reason nobody reading the page can see.
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
    // Over the calls that HAPPENED, not over the calendar: a month of no-shows
    // is a booking problem, and charging it to the close rate hides which.
    closingRate: rate(closed, liveCalls),
    noShowRate: rate(noShows, totalCalls),
  };
}

// ===== the summary above the table =====

export interface HeadlineTile {
  key: string;
  label: string;
  tone: "indigo" | "green" | "sky" | "amber";
  value: (t: BandTotals) => string;
  // The line under the figure that says what it is out of. A rate with no
  // denominator has nothing to say, so it says nothing.
  sub?: (t: BandTotals) => string;
}

// The four figures worth reading before anything else.
export const HEADLINE_TILES: HeadlineTile[] = [
  {
    key: "revenue",
    label: "Revenue",
    tone: "indigo",
    value: (t) => formatMoney(t.revenue),
    sub: (t) => `${t.closed} closed`,
  },
  {
    key: "cash",
    label: "Cash Collected",
    tone: "green",
    value: (t) => formatMoney(t.cashCollected),
  },
  {
    key: "closingRate",
    label: "Closing Rate",
    tone: "sky",
    value: (t) => formatPct(t.closingRate),
    sub: (t) => (t.liveCalls > 0 ? `${t.closed} of ${t.liveCalls} live calls` : ""),
  },
  {
    key: "noShowRate",
    label: "No Show Rate",
    tone: "amber",
    value: (t) => formatPct(t.noShowRate),
    sub: (t) => (t.totalCalls > 0 ? `${t.noShows} of ${t.totalCalls} booked` : ""),
  },
];

export interface FunnelCell {
  key: string;
  label: string;
  value: (t: BandTotals) => number;
  tone?: Tone;
}

// The month's calls, broken down the way Jake asked to see them. The last four
// add up to Live Calls exactly, so nothing is counted twice and nothing falls
// through a gap.
export const FUNNEL_CELLS: FunnelCell[] = [
  { key: "totalCalls", label: "Booked", value: (t) => t.totalCalls },
  { key: "cancelled", label: "Cancelled", value: (t) => t.cancelled, tone: "muted" },
  { key: "noShows", label: "No Shows", value: (t) => t.noShows, tone: "bad" },
  { key: "liveCalls", label: "Live Calls", value: (t) => t.liveCalls },
  { key: "unqualified", label: "Unqualified", value: (t) => t.unqualified, tone: "muted" },
  { key: "noClose", label: "No-Close", value: (t) => t.noClose, tone: "warn" },
  { key: "followUp", label: "Follow-Up", value: (t) => t.followUp, tone: "info" },
  { key: "closed", label: "Closed", value: (t) => t.closed, tone: "good" },
];

// ===== one row =====

export interface SheetRow {
  date: string;
  name: string;
  outcome: OutcomePill;
  cells: Record<string, string>;
}

export function sheetRow(call: SheetCall, timeZone: string): SheetRow {
  return {
    date: formatApptDate(call.scheduledAt, timeZone),
    name: call.name,
    outcome: outcomeFor(call),
    cells: {
      revenue: formatMoney(call.revenue),
      cashCollected: formatMoney(call.cashCollected),
      objection: call.objection,
      notes: call.notes,
      // Nothing feeds these yet. Empty rather than invented, and the table
      // draws a faint dash so the column reads as waiting, not as broken.
      paymentType: "",
      postCallForm: "",
      recordingLink: "",
    },
  };
}

// ===== formatting =====

// Whole dollars stay whole. A column of "$4,500.00" is noise; anything with
// cents in it keeps them. This is the app's own convention, and following it is
// most of what makes the page look like it belongs here.
export function formatMoney(value: number | null): string {
  if (value === null || value === undefined) return "";
  const digits = Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// A rate with no denominator is a dash, never a flattering 0%.
export function formatPct(value: number | null): string {
  if (value === null || value === undefined) return "-";
  const pct = value * 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

// "Mon 9 Mar, 11:30 AM".
//
// The sheet wrote this out in full, weekday and year and timezone on every
// line. The year is on the month stepper and the zone is on the column header,
// so repeating both on thirty rows was thirty copies of two facts.
//
// In the AGENCY's timezone, not the reader's: two people opening the same month
// in different cities must see the same appointment at the same time.
export function formatApptDate(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(new Date(at));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

// The zone's short name, for the Date column header, so the times underneath it
// are labelled once instead of thirty times.
export function zoneLabel(timeZone: string, iso?: string | null): string {
  const at = iso ? Date.parse(iso) : Date.now();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(new Date(Number.isNaN(at) ? Date.now() : at));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
