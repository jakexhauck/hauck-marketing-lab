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
}

// What the app recorded for one day. Always four real numbers: a day with rows
// here had dialing done in the app, so a 0 pickup is a measured zero, not a
// blank.
export interface RecordedCounts {
  callsMade: number;
  pickups: number;
  passThrough: number;
  meetingsBooked: number;
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
    });
    counts.callsMade += 1;
    if (dial.spoke) counts.pickups += 1;
    if (dial.pitched) counts.passThrough += 1;
    if (dial.outcome === "booked") counts.meetingsBooked += 1;
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
