import type { TrackerColumn, RollupCells } from "../components/admin/tracker/DailyTracker";
import type { RecordedCounts } from "../../functions/lib/coldCallDials";
import { formatObjections } from "../../functions/lib/coldCallDials";
import { formatNum, formatPct, pct, safeDivide } from "./trackerMonth";

// The Sales pillar's Cold Call Data page: the agency's month of dialing, as a
// grid and a set of totals.
//
// READ ONLY, like Sales Data beside it. Every count comes from an attempt
// logged on the call card (cold_call_dials), so there is nothing here to type
// and nothing that can disagree with what was measured. The caller's OWN
// tracker in Acquisition still has typed cells for dialing done off-app; this
// page deliberately does not, because it is the channel's numbers rather than
// one person's account of their week.
//
// Pure, so the rates are unit-tested without a browser.

export const COLD_CALL_NUMERIC_FIELDS = [
  "callsMade",
  "pickups",
  "passThrough",
  "meetingsBooked",
] as const;

// Each rate sits immediately right of the count that produces it, so the row
// reads left to right as the funnel it is.
export const COLD_CALL_DATA_COLUMNS: TrackerColumn[] = [
  { key: "callsMade", label: "Dials", kind: "computed" },
  { key: "pickups", label: "Talked", kind: "computed" },
  { key: "answerPct", label: "Answer %", kind: "computed" },
  { key: "passThrough", label: "Pitched", kind: "computed" },
  { key: "pitchPct", label: "Pitch %", kind: "computed" },
  { key: "meetingsBooked", label: "Booked", kind: "computed" },
  { key: "bookPct", label: "Book %", kind: "computed" },
  // Written from the reasons recorded against the day's nos, not typed. Same
  // sentence the caller's own tracker builds.
  { key: "objections", label: "Why they said no", kind: "computed" },
];

export interface ColdCallRates {
  // Of the dials, how many were answered.
  answerPct: number | null;
  // Of the ANSWERED calls, how many got as far as the pitch. Not of every dial:
  // a number nobody picked up cannot have refused to hear the pitch, and
  // dividing by it would make the script look worse the more voicemails there
  // were.
  pitchPct: number | null;
  // Of the pitches, how many booked. This is the number that measures the
  // script rather than the list.
  bookPct: number | null;
}

export function coldCallRates(counts: RecordedCounts): ColdCallRates {
  return {
    answerPct: pct(counts.pickups, counts.callsMade),
    pitchPct: pct(counts.passThrough, counts.pickups),
    bookPct: pct(counts.meetingsBooked, counts.passThrough),
  };
}

export function emptyCounts(): RecordedCounts {
  return { callsMade: 0, pickups: 0, passThrough: 0, meetingsBooked: 0, reasons: {} };
}

// The computed cells for one day. A day with no dialing renders entirely blank:
// an empty row is "nobody was on the phones", where a row of zeroes reads like
// a day spent dialing that produced nothing.
export function computeColdCallRow(day: RecordedCounts | null): RollupCells {
  if (!day || day.callsMade === 0) {
    const blank: RollupCells = {};
    for (const c of COLD_CALL_DATA_COLUMNS) blank[c.key] = "";
    return blank;
  }
  const rates = coldCallRates(day);
  return {
    callsMade: formatNum(day.callsMade),
    pickups: formatNum(day.pickups),
    answerPct: formatPct(rates.answerPct),
    passThrough: formatNum(day.passThrough),
    pitchPct: formatPct(rates.pitchPct),
    meetingsBooked: formatNum(day.meetingsBooked),
    bookPct: formatPct(rates.bookPct),
    objections: formatObjections(day.reasons),
  };
}

export interface ColdCallRollup {
  average: RollupCells;
  total: RollupCells;
  totals: RecordedCounts;
  rates: ColdCallRates;
  // Days somebody actually dialled.
  workedDays: number;
}

// The sticky footer plus the totals the funnel strip reads.
//
// The rate cells on the Total row come from the month's TOTALS, never from
// averaging the days: a 4-dial day that booked one and a 90-dial day that
// booked two are not each "worth" the same book rate.
export function computeColdCallRollup(days: RecordedCounts[]): ColdCallRollup {
  const totals = emptyCounts();
  for (const d of days) {
    totals.callsMade += d.callsMade;
    totals.pickups += d.pickups;
    totals.passThrough += d.passThrough;
    totals.meetingsBooked += d.meetingsBooked;
    for (const [reason, n] of Object.entries(d.reasons ?? {})) {
      totals.reasons[reason] = (totals.reasons[reason] ?? 0) + n;
    }
  }
  const workedDays = days.filter((d) => d.callsMade > 0).length;

  const average: RollupCells = {};
  const total: RollupCells = {};
  for (const field of COLD_CALL_NUMERIC_FIELDS) {
    // Per DIALLED day, not per calendar day: dividing a month's dials by 31
    // describes a diary, not a week on the phones.
    average[field] = formatNum(safeDivide(totals[field], workedDays), 1);
    total[field] = formatNum(totals[field]);
  }

  const rates = coldCallRates(totals);
  total.answerPct = formatPct(rates.answerPct);
  total.pitchPct = formatPct(rates.pitchPct);
  total.bookPct = formatPct(rates.bookPct);
  total.objections = formatObjections(totals.reasons);

  return { average, total, totals, rates, workedDays };
}
