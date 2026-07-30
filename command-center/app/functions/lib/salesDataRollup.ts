import { dateStringInZone } from "./tz";
import {
  SALES_CALL_OUTCOMES,
  isDeadStatus,
  isSalesCallOutcome,
  parseDeal,
  type CountableCall,
} from "./salesCalls";

// Sales Data, derived from the meetings themselves.
//
// The grid used to be typed by hand: somebody counted their own week and put
// the numbers in a table. Every one of those counts is already recorded, one
// row per meeting, in public.sales_calls: the calendar says how many were
// booked and cancelled, and the outcome recorded on Sales Calls says which ones
// turned up, which qualified and which closed. Typing them again is a second
// answer to a question the app can already answer, and the two only ever agree
// until somebody is busy.
//
// So the grid is now a report. This file is the rule that turns meetings into
// days, and it is pure: no Supabase, no Request, so the arithmetic a
// commission is argued over is unit-tested without an account.
//
// THE DAY IS THE MEETING'S DAY IN THE AGENCY'S TIMEZONE, not UTC. A 9pm New
// York call is tomorrow in UTC, and a month whose numbers slide onto the wrong
// row at the start and end is a month nobody trusts twice.

export interface SalesCallRow {
  // The meeting's slot. Null on a row the calendar never gave a time.
  scheduledAt: string | null;
  // GoHighLevel's view: confirmed, cancelled, and so on.
  appointmentStatus: string;
  // What it produced. Null until somebody has said.
  outcome: string | null;
  // Written when the outcome is recorded: showed and not a bad fit
  // (recordSalesCall.ts). Null on a meeting nobody has recorded.
  qualified: boolean | null;
  cashCollected: number | null;
  // What was sold, as the jsonb column holds it. Parsed rather than trusted:
  // see salesCalls.ts:parseDeal.
  deal?: unknown;
  // Why they said no, on either kind of no. A key from SALES_NO_REASONS.
  reason?: string | null;
  // Where the meeting came from. Blank means the app booked it.
  source?: string | null;
  // For the day's "Meetings" cell, so a row can be traced back to who it was.
  prospectName: string;
  businessName: string;
}

// The same meeting, as the shared counting rules want it. One mapper, so the
// month grid and the Sales Calls funnel are fed from identically shaped rows and
// cannot drift into counting different things.
export function toCountable(row: SalesCallRow): CountableCall {
  return {
    scheduledAt: row.scheduledAt,
    outcome: isSalesCallOutcome(row.outcome) ? row.outcome : null,
    cashCollected: row.cashCollected,
    deal: parseDeal(row.deal),
    reason: row.reason ?? null,
    source: row.source ?? null,
  };
}

export interface DerivedSalesDay {
  // Everything with a slot on this day, whatever became of it.
  onCalendar: number;
  // Called off on the calendar before it happened. A rescheduled meeting is NOT
  // here: it simply moves to its new day, taking its numbers with it, which is
  // the truth and is why this column counts cancellations and says so.
  cancelled: number;
  // Its slot has passed (or not) and nobody has recorded what happened. Counted
  // and shown, because an un-recorded meeting is not a no-show, and a day that
  // quietly reads "0 taken" while three meetings sit unanswered is the exact
  // lie this column exists to prevent.
  awaiting: number;
  // Meetings with an outcome recorded. The denominator for show-up %.
  decided: number;
  // They turned up: closed, follow up, or not a fit.
  taken: number;
  // Turned up and was worth selling to (not_a_fit is the "no" here).
  qualified: number;
  closed: number;
  cash: number;
  // Monthly recurring revenue the day's closes added. Counted apart from cash:
  // cash is what was taken on the call, this is what those clients are worth
  // every month from now on. Zero on a day that closed nothing, and on a close
  // whose retainer nobody filled in.
  mrr: number;
  // Who the day's meetings were with, in the order they were read. The day's
  // numbers are traceable to names without opening another page.
  names: string[];
}

export function emptyDay(): DerivedSalesDay {
  return {
    onCalendar: 0,
    cancelled: 0,
    awaiting: 0,
    decided: 0,
    taken: 0,
    qualified: 0,
    closed: 0,
    cash: 0,
    mrr: 0,
    names: [],
  };
}

// What a meeting is called on the day's list. The prospect, falling back to the
// business, because a card reading "Unnamed" is worse than one reading the
// company somebody at least typed.
export function callLabel(row: SalesCallRow): string {
  return row.prospectName.trim() || row.businessName.trim() || "Unnamed";
}

export interface SalesRollup {
  days: Record<string, DerivedSalesDay>;
  // Meetings the calendar gave no time, so they belong to no day. Counted
  // rather than dropped: a number missing from a month should be visible as a
  // number missing from a month.
  undated: number;
}

// A month of meetings, grouped into the days they happened on.
//
// The counting rules, in one place:
//   every meeting with a slot counts as on the calendar;
//   a dead calendar status counts as cancelled;
//   an outcome makes the meeting decided, and no outcome makes it awaiting;
//   an outcome whose meta says showed counts as taken;
//   qualified is read from the stored flag, never re-derived from the outcome,
//     because the flag is what the database holds and if the two ever disagree
//     the stored fact wins;
//   cash is counted wherever it was taken.
export function rollUpSalesCalls(rows: SalesCallRow[], timeZone: string): SalesRollup {
  const days: Record<string, DerivedSalesDay> = {};
  let undated = 0;

  for (const row of rows) {
    const at = row.scheduledAt ? Date.parse(row.scheduledAt) : NaN;
    if (Number.isNaN(at)) {
      undated += 1;
      continue;
    }
    const day = dateStringInZone(timeZone, at);
    const d = (days[day] ??= emptyDay());

    d.onCalendar += 1;
    d.names.push(callLabel(row));
    d.cash += row.cashCollected ?? 0;

    const dead = isDeadStatus(row.appointmentStatus ?? "");
    if (dead) d.cancelled += 1;

    if (isSalesCallOutcome(row.outcome)) {
      d.decided += 1;
      if (SALES_CALL_OUTCOMES[row.outcome].showed) d.taken += 1;
      if (row.outcome === "closed") {
        d.closed += 1;
        // Only on a close, unlike cash: a retainer recorded against a meeting
        // that did not sell is a mistake upstream, and totalling it here would
        // report revenue from a lost deal. Same rule as salesCalls.ts:totalsFor.
        d.mrr += parseDeal(row.deal)?.monthly ?? 0;
      }
    } else if (!dead) {
      // A cancelled meeting is not waiting on an answer: it was called off, and
      // asking somebody to record an outcome for it would be asking them to
      // invent one.
      d.awaiting += 1;
    }

    if (row.qualified === true) d.qualified += 1;
  }

  return { days, undated };
}

// Keep only the MEETINGS whose day falls inside "YYYY-MM".
//
// The month grid is trimmed by day (daysInMonth below). The source table and the
// reason list are counted per MEETING rather than per day, so they need the same
// trim applied to the rows themselves: the query window is widened by a day at
// each end, and counting those extra rows would put a neighbouring month's
// objections in this month's list.
//
// The timezone rule is the one the grid uses, for the same reason it exists
// there: a 9pm New York call is tomorrow in UTC, and a table that disagreed with
// the grid beside it about which month a meeting belongs to would be worse than
// no table.
export function rowsInMonth(
  rows: SalesCallRow[],
  timeZone: string,
  month: string,
): SalesCallRow[] {
  return rows.filter((row) => {
    const at = row.scheduledAt ? Date.parse(row.scheduledAt) : NaN;
    // A meeting with no time belongs to no day, so it belongs to no month
    // either. It is reported as undated rather than counted here.
    if (Number.isNaN(at)) return false;
    return dateStringInZone(timeZone, at).startsWith(`${month}-`);
  });
}

// Keep only the days inside "YYYY-MM". The database is queried on a UTC window
// widened by a day at each end (a New York day reaches into two UTC days), so
// the edges have to be trimmed back here, after the timezone has been applied.
export function daysInMonth(
  days: Record<string, DerivedSalesDay>,
  month: string,
): Record<string, DerivedSalesDay> {
  const out: Record<string, DerivedSalesDay> = {};
  for (const [day, counts] of Object.entries(days)) {
    if (day.startsWith(`${month}-`)) out[day] = counts;
  }
  return out;
}

// A rollUpDials lived here, counting cold_call_dials so Sales Data could open
// its funnel with the month's dialing. It is gone with that half of the strip:
// the dialing month is reported on Acquisition > Cold Call, from
// lib/coldCallDials, and this file counts meetings only.
