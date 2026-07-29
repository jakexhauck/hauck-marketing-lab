// What a booked meeting became, and the arithmetic that follows from it.
//
// Cold Call ended at "Booked". A meeting that had been and gone sat under
// "Already happened" forever, so the only number that says whether the dialing
// is worth doing (dials -> bookings -> shows -> closes) stopped one step early.
// This is the missing step: four outcomes, and the counts derived from them.
//
// Pure. No database, no network, so the endpoint and the browser can never
// disagree about what a show rate is.

export type SalesCallOutcome =
  | "closed"
  | "follow_up"
  | "not_interested"
  | "not_qualified"
  | "no_show";

export interface OutcomeMeta {
  // Did the prospect turn up? This is the whole reason no_show is an OUTCOME
  // rather than an appointment status: the slot was reached and nobody came,
  // which is a different fact from a meeting cancelled the day before.
  showed: boolean;
  // Did it produce a deal?
  won: boolean;
  // Is this outcome incomplete without a date to come back on?
  needsFollowUp: boolean;
  label: string;
}

export const SALES_CALL_OUTCOMES: Record<SalesCallOutcome, OutcomeMeta> = {
  closed: { showed: true, won: true, needsFollowUp: false, label: "Closed" },
  follow_up: { showed: true, won: false, needsFollowUp: true, label: "Follow up" },
  // The two flavours of no, and the distinction is load-bearing: one is a fact
  // about the PITCH, the other about the LIST. Merging them makes the close
  // rate look worse than it is and hides which of the two needs fixing. Named
  // in 0067 after the tags the live automation listens for.
  //
  // Heard it and said no. Still a real prospect, so still qualified.
  not_interested: { showed: true, won: false, needsFollowUp: false, label: "Not interested" },
  // Never a prospect. This is the one that sets qualified false.
  not_qualified: { showed: true, won: false, needsFollowUp: false, label: "Not qualified" },
  no_show: { showed: false, won: false, needsFollowUp: false, label: "No-showed" },
};

export function isSalesCallOutcome(value: unknown): value is SalesCallOutcome {
  return typeof value === "string" && value in SALES_CALL_OUTCOMES;
}

// Where a meeting stands on the CALENDAR, which is a different question from
// what it produced. A cancelled meeting is still a fact worth keeping (it was
// booked, and it did not happen), so nothing is ever deleted for it; it is
// counted as a cancellation and excluded from the meetings still waiting on an
// answer. GoHighLevel's own vocabulary varies by endpoint; lowercased and
// stripped of spaces, these are the ones that mean "not going ahead".
//
// Lives here, beside the outcomes, rather than in the sync that first needed
// it: the Sales Data rollup counts cancellations too, and a second copy of this
// list is how two pages start disagreeing about what "cancelled" means.
const DEAD_STATUSES = new Set(["cancelled", "canceled", "invalid", "noshow", "no-show"]);

export function isDeadStatus(status: string): boolean {
  return DEAD_STATUSES.has(status.trim().toLowerCase().replace(/\s+/g, ""));
}

// A meeting, as far as the counting is concerned.
export interface CountableCall {
  scheduledAt: string | null;
  outcome: SalesCallOutcome | null;
  cashCollected: number | null;
  // The date somebody promised to come back on, set with a follow_up outcome.
  // Optional so every existing caller is unaffected; without it a follow-up
  // simply never becomes due, which is the safe direction (it stays a record
  // rather than becoming a job nobody agreed to).
  followUpAt?: string | null;
}

export interface SalesCallTotals {
  // Every meeting on the books, whatever became of it.
  booked: number;
  // Meetings that have an outcome recorded. The denominator for show rate:
  // a meeting still in the future is not a missing show, it is a future one.
  decided: number;
  // Meetings still waiting on somebody to say what happened. This number
  // existing at all is the point: an un-recorded meeting is not a no-show.
  pending: number;
  showed: number;
  noShowed: number;
  closed: number;
  // Never a prospect.
  notQualified: number;
  // Turned up, qualified, did not buy. Counted apart from notQualified because
  // the two say different things about what needs fixing.
  notInterested: number;
  followUp: number;
  cash: number;
  // Of the meetings that were decided, how many turned up. Null when nothing has
  // been decided, because 0/0 is not a rate of zero, it is no answer yet.
  showRate: number | null;
  // Of the meetings that turned up, how many closed. Null on the same grounds.
  closeRate: number | null;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function totalsFor(calls: CountableCall[]): SalesCallTotals {
  let decided = 0;
  let showed = 0;
  let noShowed = 0;
  let closed = 0;
  let notQualified = 0;
  let notInterested = 0;
  let followUp = 0;
  let cash = 0;

  for (const call of calls) {
    // Cash is counted wherever it was taken. It should only ever land on a
    // close, but money that came in is money that came in, and quietly dropping
    // it because the outcome was typed oddly would be the wrong kind of tidy.
    cash += call.cashCollected ?? 0;

    if (!call.outcome) continue;
    decided += 1;
    const meta = SALES_CALL_OUTCOMES[call.outcome];
    if (meta.showed) showed += 1;
    else noShowed += 1;
    if (call.outcome === "closed") closed += 1;
    if (call.outcome === "not_qualified") notQualified += 1;
    if (call.outcome === "not_interested") notInterested += 1;
    if (call.outcome === "follow_up") followUp += 1;
  }

  return {
    booked: calls.length,
    decided,
    pending: calls.length - decided,
    showed,
    noShowed,
    closed,
    notQualified,
    notInterested,
    followUp,
    cash,
    showRate: rate(showed, decided),
    closeRate: rate(closed, showed),
  };
}

// Which shelf a meeting belongs on.
//
//   due_back  answered "follow up", and the day agreed has arrived. A promise
//             to come back is the only kind of RECORDED meeting that is still
//             a job, and it used to be filed under "recorded" where it was
//             never seen again: the date was shown on the row and nothing
//             else. That is a promise the app took and quietly dropped.
//   upcoming  still in the future, nothing to say about it yet
//   awaiting  its slot has passed and nobody has said what happened
//   recorded  done and said
//
// The two job groups (due_back, awaiting) lead the page; the rest are records.
export type MeetingGroup = "due_back" | "upcoming" | "awaiting" | "recorded";

// Has the day somebody agreed to come back on arrived?
//
// Compared against the END of that day, not the instant it was written: a
// follow-up agreed "Tuesday" is not late at one minute past midnight on
// Tuesday, and a list that says it is trains somebody to ignore it. Anything
// unparseable is not due, because inventing a deadline is worse than missing
// the column.
export function isDueBack(followUpAt: string | null | undefined, nowMs: number): boolean {
  if (!followUpAt) return false;
  const at = Date.parse(followUpAt);
  if (Number.isNaN(at)) return false;
  return at <= nowMs;
}

// How late a follow-up is, in whole days. 0 means due today, negative is still
// to come. Used to sort the most overdue to the top.
export function daysLate(followUpAt: string | null | undefined, nowMs: number): number | null {
  if (!followUpAt) return null;
  const at = Date.parse(followUpAt);
  if (Number.isNaN(at)) return null;
  return Math.floor((nowMs - at) / 86_400_000);
}

export function groupFor(call: CountableCall, nowMs: number): MeetingGroup {
  if (call.outcome === "follow_up" && isDueBack(call.followUpAt, nowMs)) return "due_back";
  if (call.outcome) return "recorded";
  // A meeting with no time on it cannot be in the future, and leaving it
  // "upcoming" forever would hide it. It needs an answer, so it gets asked for.
  if (!call.scheduledAt) return "awaiting";
  const at = Date.parse(call.scheduledAt);
  if (Number.isNaN(at)) return "awaiting";
  return at > nowMs ? "upcoming" : "awaiting";
}
