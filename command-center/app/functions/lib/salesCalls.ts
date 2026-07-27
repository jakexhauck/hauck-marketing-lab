// What a booked meeting became, and the arithmetic that follows from it.
//
// Cold Call ended at "Booked". A meeting that had been and gone sat under
// "Already happened" forever, so the only number that says whether the dialing
// is worth doing (dials -> bookings -> shows -> closes) stopped one step early.
// This is the missing step: four outcomes, and the counts derived from them.
//
// Pure. No database, no network, so the endpoint and the browser can never
// disagree about what a show rate is.

export type SalesCallOutcome = "closed" | "follow_up" | "no_show" | "not_a_fit";

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
  not_a_fit: { showed: true, won: false, needsFollowUp: false, label: "Not a fit" },
  no_show: { showed: false, won: false, needsFollowUp: false, label: "No-showed" },
};

export function isSalesCallOutcome(value: unknown): value is SalesCallOutcome {
  return typeof value === "string" && value in SALES_CALL_OUTCOMES;
}

// A meeting, as far as the counting is concerned.
export interface CountableCall {
  scheduledAt: string | null;
  outcome: SalesCallOutcome | null;
  cashCollected: number | null;
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
  notAFit: number;
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
  let notAFit = 0;
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
    if (call.outcome === "not_a_fit") notAFit += 1;
    if (call.outcome === "follow_up") followUp += 1;
  }

  return {
    booked: calls.length,
    decided,
    pending: calls.length - decided,
    showed,
    noShowed,
    closed,
    notAFit,
    followUp,
    cash,
    showRate: rate(showed, decided),
    closeRate: rate(closed, showed),
  };
}

// Which shelf a meeting belongs on.
//
//   upcoming  still in the future, nothing to say about it yet
//   awaiting  its slot has passed and nobody has said what happened. This is
//             the only group that is a job rather than a record, so it is the
//             one the page leads with.
//   recorded  done and said
export type MeetingGroup = "upcoming" | "awaiting" | "recorded";

export function groupFor(call: CountableCall, nowMs: number): MeetingGroup {
  if (call.outcome) return "recorded";
  // A meeting with no time on it cannot be in the future, and leaving it
  // "upcoming" forever would hide it. It needs an answer, so it gets asked for.
  if (!call.scheduledAt) return "awaiting";
  const at = Date.parse(call.scheduledAt);
  if (Number.isNaN(at)) return "awaiting";
  return at > nowMs ? "upcoming" : "awaiting";
}
