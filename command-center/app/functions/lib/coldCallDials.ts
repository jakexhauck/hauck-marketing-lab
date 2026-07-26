// Cold Call dials: what an outcome counts as, and how a month of them rolls up
// into the tracker's daily counts. Pure, no Supabase, no Request, so the
// counting rules that a commission is argued over are unit-tested.
//
// The four counts are DERIVED here and never stored (migration 0052). The typed
// grid (cold_calls) still exists, but its cells are now overrides: a day shows
// what was typed if anything was, otherwise what was recorded.

// The five buttons on the call card. spoke makes a pickup; pitched makes a
// pass-through. Keeping the pairing in one table is what stops the UI and the
// rollup from ever disagreeing about what a "pickup" is.
export const DIAL_OUTCOMES = {
  no_answer: { spoke: false, pitched: false },
  brush_off: { spoke: true, pitched: false },
  not_interested: { spoke: true, pitched: true },
  callback: { spoke: true, pitched: true },
  booked: { spoke: true, pitched: true },
} as const;

export type DialOutcome = keyof typeof DIAL_OUTCOMES;

// Why a prospect said no. Every reason carries the outcome it implies, so the
// caller picks a sentence and the server decides spoke/pitched from it. That
// keeps the one rule this table exists for: the numbers commission is paid
// against are never asserted by the client.
//
// "Would not engage", "Not the decision maker" and "Not a fit" are brush_off:
// the call was answered but never got as far as the pitch, and counting them as
// pass-throughs would inflate the only number that measures the script.
export const NOT_INTERESTED_REASONS = {
  pitched_no: { label: "Heard the pitch, said no", outcome: "not_interested" },
  no_engage: { label: "Would not engage", outcome: "brush_off" },
  not_decision_maker: { label: "Not the decision maker", outcome: "brush_off" },
  has_agency: { label: "Already has an agency", outcome: "not_interested" },
  bad_fit: { label: "Not a fit", outcome: "brush_off" },
} as const;

export type NotInterestedReason = keyof typeof NOT_INTERESTED_REASONS;

export const NOT_INTERESTED_REASON_KEYS = Object.keys(
  NOT_INTERESTED_REASONS,
) as NotInterestedReason[];

export function isNotInterestedReason(value: unknown): value is NotInterestedReason {
  return typeof value === "string" && value in NOT_INTERESTED_REASONS;
}

export const DIAL_OUTCOME_KEYS = Object.keys(DIAL_OUTCOMES) as DialOutcome[];

export function isDialOutcome(value: unknown): value is DialOutcome {
  return typeof value === "string" && value in DIAL_OUTCOMES;
}

// One dial as it comes back from Supabase (the columns the rollup needs).
export interface DialRow {
  day: string; // "YYYY-MM-DD"
  spoke: boolean;
  pitched: boolean;
  outcome: string;
  // Why they said no, null for every dial that was not a no.
  reason?: string | null;
}

// What the app recorded for one day. Always four real numbers: a day with rows
// here had dialing done in the app, so a 0 pickup is a measured zero, not a
// blank.
export interface RecordedCounts {
  callsMade: number;
  pickups: number;
  passThrough: number;
  meetingsBooked: number;
  // How many of the day's nos gave each reason. The Objections column is
  // written from this, so "why we lose them" is counted rather than typed.
  reasons: Record<string, number>;
}

// The counting rules, in one place:
//   every dial counts as a dial;
//   spoke counts as a pickup;
//   pitched counts as a pass-through;
//   outcome "booked" counts as a booking.
//
// spoke/pitched are read from the ROW, not re-derived from the outcome, because
// the row is what the DB holds; if the two ever disagree the stored fact wins.
export function rollUpDialsByDay(dials: DialRow[]): Record<string, RecordedCounts> {
  const byDay: Record<string, RecordedCounts> = {};
  for (const dial of dials) {
    const day = (dial.day ?? "").slice(0, 10);
    if (!day) continue;
    const counts = (byDay[day] ??= {
      callsMade: 0,
      pickups: 0,
      passThrough: 0,
      meetingsBooked: 0,
      reasons: {},
    });
    counts.callsMade += 1;
    if (dial.spoke) counts.pickups += 1;
    if (dial.pitched) counts.passThrough += 1;
    if (dial.outcome === "booked") counts.meetingsBooked += 1;
    if (dial.reason) counts.reasons[dial.reason] = (counts.reasons[dial.reason] ?? 0) + 1;
  }
  return byDay;
}

// A tracker row as the API returns it: the typed cells (null where nothing was
// typed) plus what the app recorded for that day.
export interface TrackerDay {
  id: string;
  day: string;
  callsMade: number | null;
  pickups: number | null;
  passThrough: number | null;
  meetingsBooked: number | null;
  objections: string | null;
  notes: string | null;
  recorded: RecordedCounts | null;
}

export type TypedDay = Omit<TrackerDay, "recorded">;

// Attach each day's recorded counts to its typed row, and stand up a row for a
// day that was dialled but never typed into. Without that second half a day
// worked entirely through the buttons would be invisible in the grid.
//
// The synthetic row's id is marked so nothing downstream mistakes it for a
// cold_calls primary key; there is no row to update until someone types.
export function mergeRecordedDays(
  typed: TypedDay[],
  recorded: Record<string, RecordedCounts>,
): TrackerDay[] {
  const merged: TrackerDay[] = typed.map((row) => ({
    ...row,
    recorded: recorded[row.day] ?? null,
  }));

  const seen = new Set(typed.map((row) => row.day));
  for (const [day, counts] of Object.entries(recorded)) {
    if (seen.has(day)) continue;
    merged.push({
      id: `recorded:${day}`,
      day,
      callsMade: null,
      pickups: null,
      passThrough: null,
      meetingsBooked: null,
      objections: null,
      notes: null,
      recorded: counts,
    });
  }

  return merged.sort((a, b) => a.day.localeCompare(b.day));
}


// The Objections cell, written from the day's recorded reasons: "3 already has
// an agency, 2 would not engage". Commonest first, and ties fall back to the
// order the reasons are declared in so the sentence is stable between reads.
//
// Empty string when nothing was recorded, which the grid renders as a blank
// cell rather than as "0 objections".
export function formatObjections(reasons: Record<string, number> | null | undefined): string {
  if (!reasons) return "";
  const order = NOT_INTERESTED_REASON_KEYS;
  const parts = Object.entries(reasons)
    .filter(([key, n]) => n > 0 && key in NOT_INTERESTED_REASONS)
    .sort(([aKey, a], [bKey, b]) =>
      b - a || order.indexOf(aKey as NotInterestedReason) - order.indexOf(bKey as NotInterestedReason),
    )
    .map(([key, n]) => `${n} ${NOT_INTERESTED_REASONS[key as NotInterestedReason].label.toLowerCase()}`);
  return parts.join(", ");
}
