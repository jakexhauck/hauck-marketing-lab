// What a booked meeting became, and the arithmetic that follows from it.
//
// Cold Call ended at "Booked". A meeting that had been and gone sat under
// "Already happened" forever, so the only number that says whether the dialing
// is worth doing (dials -> bookings -> shows -> closes) stopped one step early.
// This is the missing step: four outcomes, and the counts derived from them.
//
// Pure. No database, no network, so the endpoint and the browser can never
// disagree about what a show rate is.

import { OFFER_FAMILIES, offerVariant } from "./salesOffers";

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

// WHAT WAS SOLD, which is a different question from what was paid.
//
// cash_collected is money that changed hands on the call. An agency sells
// retainers, so a $2,000/month client who paid $500 today reported as $500 is
// wrong by a factor of the entire relationship. This is the retainer.
//
// `months` is optional because month-to-month is a real deal, not a missing
// field. Contract value is DERIVED from the two (see contractValue) and never
// stored: two columns holding one product is how they come to disagree.
//
// Stored in sales_calls.deal, a jsonb column that has existed since 0057 and
// held nothing until now.
export interface SalesDeal {
  // Dollars per month. Always present on a deal; a deal worth nothing a month
  // is not a deal, it is an empty form.
  monthly: number;
  // How many months were agreed, or null for month-to-month.
  months: number | null;
}

function positive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// Read a deal off whatever the database or a request body holds.
//
// Null for anything that is not one, including a zero monthly: an outcome
// recorded without filling the boxes in must read as "no figure given" rather
// than as a $0/month client, which would drag every average down while looking
// like data.
export function parseDeal(raw: unknown): SalesDeal | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const monthly = positive(obj.monthly);
  if (monthly === null) return null;
  const months = positive(obj.months);
  // A term is only a term if it is a whole number of months. 1.5 is somebody's
  // typo, and honouring it would put fractions in a contract value.
  return { monthly, months: months !== null && Number.isInteger(months) ? months : null };
}

// The whole deal, where the term is known. Null on month-to-month: the value of
// a contract with no end is not a number, and printing one would be a guess
// wearing a total's clothes.
export function contractValue(deal: SalesDeal | null): number | null {
  if (!deal || deal.months === null) return null;
  return deal.monthly * deal.months;
}

// WHY THEY SAID NO, from a fixed list so it can be counted.
//
// Deliberately NOT the cold-call list (coldCallDials.ts:NOT_INTERESTED_REASONS).
// Those reasons describe a call that never reached a pitch ("would not engage",
// "not the decision maker"), which is a different question from why a demo that
// happened did not close. Sharing the list would mean one panel answering two
// questions and neither answer being usable.
//
// Both flavours of no use this list: not_interested (heard it, said no) and
// not_qualified (never a prospect). The outcome already records which kind of no
// it was, so the reason only has to say why.
export const SALES_NO_REASONS = {
  price: { label: "Too expensive" },
  thinking: { label: "Wants to think about it" },
  has_agency: { label: "Already has an agency" },
  not_decision_maker: { label: "Not the decision maker" },
  timing: { label: "Bad timing" },
  wrong_fit: { label: "Not a business we serve" },
  no_trust: { label: "Not convinced it works" },
  other: { label: "Something else" },
} as const;

export type SalesNoReason = keyof typeof SALES_NO_REASONS;

export const SALES_NO_REASON_KEYS = Object.keys(SALES_NO_REASONS) as SalesNoReason[];

export function isSalesNoReason(value: unknown): value is SalesNoReason {
  return typeof value === "string" && value in SALES_NO_REASONS;
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
  // What was sold, on a close. Optional for the same reason: a caller that does
  // not pass it simply reports no new MRR.
  deal?: SalesDeal | null;
  // Why they said no, on either kind of no. A key from SALES_NO_REASONS.
  reason?: string | null;
  // Where the meeting came from: "" or "Cold call" when the app booked it,
  // "Calendar" when the sync adopted one nobody typed here.
  source?: string | null;
  // Which offer was pitched (0086), as the variant id. Optional in the same way
  // the deal is: a caller that does not pass it simply reports no offer split.
  offerVariant?: string | null;
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
  // Monthly recurring revenue the closes in this set added. Counted apart from
  // cash because they answer different questions: cash is what came in, this is
  // what the month is worth from now on.
  newMrr: number;
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
  let newMrr = 0;

  for (const call of calls) {
    // Cash is counted wherever it was taken. It should only ever land on a
    // close, but money that came in is money that came in, and quietly dropping
    // it because the outcome was typed oddly would be the wrong kind of tidy.
    cash += call.cashCollected ?? 0;

    // A retainer, unlike cash, is counted ONLY on a close. Cash that arrived is
    // a fact whatever the outcome says; a monthly figure sitting on a meeting
    // that did not sell is a mistake upstream, and totalling it would report
    // revenue from a lost deal.
    if (call.outcome === "closed") newMrr += parseDeal(call.deal)?.monthly ?? 0;

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
    newMrr,
    showRate: rate(showed, decided),
    closeRate: rate(closed, showed),
  };
}

// ---------------------------------------------------------------------------
// Where the meetings came from, and why the nos were nos.

// What a source is called on screen.
//
// A blank source means the app booked it: the column has defaulted to '' since
// 0057 and only the calendar sync writes a value. That rule lived inline in the
// row's provenance line; it lives here now, because the source TABLE and the row
// have to agree about what a blank means or the two will quietly report
// different populations.
export function sourceLabel(source: string | null | undefined): string {
  const value = (source ?? "").trim();
  return value || "Cold call";
}

export interface SourceSplitRow {
  source: string;
  booked: number;
  decided: number;
  showed: number;
  closed: number;
  cash: number;
  mrr: number;
  showRate: number | null;
  closeRate: number | null;
}

// The funnel, split by where the meeting came from.
//
// This is the number that decides where the next hour goes: 10 cold-call
// meetings that close 1 and 3 inbound ones that close 2 are the same "13 booked"
// on every other page. Rates use the same rules as the page funnel (showed over
// DECIDED, closed over showed), so a source row and the whole-month row can
// never be read against each other and disagree.
//
// Busiest first. A source nobody has recorded an outcome for yet reports null
// rates rather than 0%.
export function bySource(calls: CountableCall[]): SourceSplitRow[] {
  const byKey = new Map<string, SourceSplitRow>();

  for (const call of calls) {
    const source = sourceLabel(call.source);
    let row = byKey.get(source);
    if (!row) {
      row = {
        source,
        booked: 0,
        decided: 0,
        showed: 0,
        closed: 0,
        cash: 0,
        mrr: 0,
        showRate: null,
        closeRate: null,
      };
      byKey.set(source, row);
    }

    row.booked += 1;
    row.cash += call.cashCollected ?? 0;
    if (call.outcome === "closed") row.mrr += parseDeal(call.deal)?.monthly ?? 0;
    if (!call.outcome) continue;
    row.decided += 1;
    if (SALES_CALL_OUTCOMES[call.outcome].showed) row.showed += 1;
    if (call.outcome === "closed") row.closed += 1;
  }

  const rows = [...byKey.values()];
  for (const row of rows) {
    row.showRate = rate(row.showed, row.decided);
    row.closeRate = rate(row.closed, row.showed);
  }
  return rows.sort((a, b) => b.booked - a.booked || a.source.localeCompare(b.source));
}

export interface OfferSplitRow {
  // The variant id, and the two labels for it: the family it belongs to and the
  // shape within that family. Resolved here rather than in the page, so a
  // variant renamed in the catalogue is renamed everywhere at once.
  variant: string;
  family: string;
  label: string;
  // Meetings where they turned up and this offer was on the table. Booked is
  // deliberately NOT the denominator: an offer cannot be pitched to a no-show,
  // so counting one against the offer would punish it for somebody's diary.
  pitched: number;
  closed: number;
  cash: number;
  mrr: number;
  // Closed over pitched. Null until at least one call has carried this offer,
  // rather than 0%, which reads as "this offer never closes".
  closeRate: number | null;
}

// How each offer actually performs.
//
// The question the offer field was added to answer: does the $250 setup fee
// cost the deal, and does the 10% close as often as the 5%. Nothing else on the
// page can say, because every other split counts meetings by where they came
// from rather than by what was put on the table.
//
// Only meetings where somebody TURNED UP are counted. A no-show never heard an
// offer, and letting it into the denominator would mean an offer's close rate
// moved when a prospect overslept.
//
// Best first, so the answer is the top row. An unrecognised variant is skipped
// rather than becoming its own row: it is a value from a catalogue this build
// no longer has, and a row labelled with a raw id answers nothing.
export function byOffer(calls: CountableCall[]): OfferSplitRow[] {
  const byKey = new Map<string, OfferSplitRow>();

  for (const call of calls) {
    if (!call.outcome || !SALES_CALL_OUTCOMES[call.outcome].showed) continue;
    const variant = offerVariant(call.offerVariant);
    if (!variant) continue;

    let row = byKey.get(variant.id);
    if (!row) {
      row = {
        variant: variant.id,
        family: OFFER_FAMILIES.find((f) => f.id === variant.family)?.label ?? variant.family,
        label: variant.label,
        pitched: 0,
        closed: 0,
        cash: 0,
        mrr: 0,
        closeRate: null,
      };
      byKey.set(variant.id, row);
    }

    row.pitched += 1;
    row.cash += call.cashCollected ?? 0;
    if (call.outcome === "closed") {
      row.closed += 1;
      row.mrr += parseDeal(call.deal)?.monthly ?? 0;
    }
  }

  const rows = [...byKey.values()];
  for (const row of rows) row.closeRate = rate(row.closed, row.pitched);
  // By close rate, then by how much it has been tried: a 1-for-1 offer should
  // not sit above a 9-for-20 one on the strength of a single call.
  return rows.sort(
    (a, b) =>
      (b.closeRate ?? -1) - (a.closeRate ?? -1) ||
      b.pitched - a.pitched ||
      a.variant.localeCompare(b.variant),
  );
}

// How many of the nos gave each reason.
//
// Only the two no outcomes are counted, and only reasons on the list: a reason
// stored against a close is a bug upstream, and an unrecognised key becoming its
// own row would let a typo look like an objection worth fixing.
export function reasonCounts(calls: CountableCall[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of calls) {
    if (call.outcome !== "not_interested" && call.outcome !== "not_qualified") continue;
    if (!isSalesNoReason(call.reason)) continue;
    counts[call.reason] = (counts[call.reason] ?? 0) + 1;
  }
  return counts;
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
