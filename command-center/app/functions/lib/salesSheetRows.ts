import { dateStringInZone } from "./tz";
import {
  SALES_CALL_OUTCOMES,
  SALES_NO_REASONS,
  isDeadStatus,
  isSalesCallOutcome,
  isSalesNoReason,
  contractValue,
  parseDeal,
} from "./salesCalls";

// Sales Data, one row per meeting.
//
// This file replaces salesDataRollup.ts, which grouped the same meetings into
// DAYS. The page above it is now a clone of the sales tracking sheet Jake
// actually works from, and that sheet has one line per call: the date, who it
// was with, what it became, what it paid. A day rollup cannot draw that, because
// a day with three meetings on it is three lines, not one.
//
// What did NOT change is where the numbers come from. Every field here is read
// off a meeting already recorded in public.sales_calls, exactly as the day
// rollup read them, so this page and the Sales Calls funnel still cannot drift
// into disagreeing about a month. Nothing on the sheet is typed.
//
// Kept pure: no Supabase, no Request. The arithmetic a commission is argued over
// is unit-tested without an account.
//
// THE MONTH IS THE MEETING'S MONTH IN THE AGENCY'S TIMEZONE, not UTC. A 9pm New
// York call is tomorrow in UTC, and a month whose meetings slide onto the wrong
// side at the start and end is a month nobody trusts twice.

export interface SalesCallRow {
  // The meeting's slot. Null on a row the calendar never gave a time.
  scheduledAt: string | null;
  // GoHighLevel's view: confirmed, cancelled, and so on.
  appointmentStatus: string;
  // What it produced. Null until somebody has said.
  outcome: string | null;
  cashCollected: number | null;
  // What was sold, as the jsonb column holds it. Parsed rather than trusted:
  // see salesCalls.ts:parseDeal.
  deal?: unknown;
  // Why they said no, on either kind of no. A key from SALES_NO_REASONS.
  reason?: string | null;
  // The notes taken when the outcome was recorded.
  scratchpad?: string | null;
  prospectName: string;
  businessName: string;
}

// One line of the sheet, as it goes over the wire.
//
// Deliberately flags rather than the raw outcome string: the sheet has a
// "Closed" column and a separate "Calls" column that says Live Call or No Show,
// and asking the table to re-derive both from an outcome key would put the
// counting rules in the component. They live here, once, beside the tests.
export interface SheetCall {
  scheduledAt: string | null;
  name: string;
  closed: boolean;
  // They turned up. The Calls column's "Live Call".
  showed: boolean;
  // The slot was reached and nobody came. Not the same fact as cancelled.
  noShow: boolean;
  // Called off on the calendar before it happened.
  cancelled: boolean;
  // The whole contract, where the term is known. Null on month-to-month and on
  // a close where nobody filled the figures in.
  revenue: number | null;
  cashCollected: number | null;
  // Why they said no, in the words the sheet shows. Empty when there was no no.
  objection: string;
  needsFollowUp: boolean;
  notes: string;
}

// What a meeting is called on the sheet. The prospect, falling back to the
// business, because a line reading "Unnamed" is worse than one reading the
// company somebody at least typed.
export function callLabel(row: SalesCallRow): string {
  return row.prospectName.trim() || row.businessName.trim() || "Unnamed";
}

export function toSheetCall(row: SalesCallRow): SheetCall {
  const outcome = isSalesCallOutcome(row.outcome) ? row.outcome : null;
  const meta = outcome ? SALES_CALL_OUTCOMES[outcome] : null;

  return {
    scheduledAt: row.scheduledAt,
    name: callLabel(row),
    closed: outcome === "closed",
    showed: meta?.showed ?? false,
    noShow: outcome === "no_show",
    cancelled: isDeadStatus(row.appointmentStatus ?? ""),
    // Only on a close, unlike cash: a retainer recorded against a meeting that
    // did not sell is a mistake upstream, and printing it in the Revenue column
    // would report revenue from a lost deal. Same rule as salesCalls.ts.
    revenue: outcome === "closed" ? contractValue(parseDeal(row.deal)) : null,
    // Cash is counted wherever it was taken, close or not.
    cashCollected: row.cashCollected,
    objection: isSalesNoReason(row.reason) ? SALES_NO_REASONS[row.reason].label : "",
    needsFollowUp: meta?.needsFollowUp ?? false,
    notes: row.scratchpad ?? "",
  };
}

// Keep only the meetings whose day falls inside "YYYY-MM".
//
// The database is queried on a UTC window widened by a day at each end (a New
// York day reaches into two UTC days), so the edges have to be trimmed back
// here, after the timezone has been applied.
export function callsInMonth(
  rows: SalesCallRow[],
  timeZone: string,
  month: string,
): SalesCallRow[] {
  return rows.filter((row) => {
    const at = row.scheduledAt ? Date.parse(row.scheduledAt) : NaN;
    // A meeting with no time belongs to no day, so it belongs to no month
    // either. It is reported as undated by the endpoint rather than counted.
    if (Number.isNaN(at)) return false;
    return dateStringInZone(timeZone, at).startsWith(`${month}-`);
  });
}
