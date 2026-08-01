// Cold Call dials: what an outcome counts as, and how a month of them rolls up
// into the tracker's daily counts. Pure, no Supabase, no Request, so the
// counting rules that a commission is argued over are unit-tested.
//
// The four counts are DERIVED here and never stored (migration 0052). The typed
// grid (cold_calls) still exists, but its cells are now overrides: a day shows
// what was typed if anything was, otherwise what was recorded.

// The six buttons on the call card, and what each one counts as.
//
// spoke makes a pickup; pitched makes a pass-through. Keeping the pairing in one
// table is what stops the UI and the rollup from ever disagreeing about what a
// "pickup" is, and it is why nothing outside this file decides either flag.
//
// The three ways a call ends in no are separate outcomes rather than one outcome
// with a reason attached (0078). They are not shades of the same thing: only
// pitch_no reached the pitch, so only pitch_no counts toward pass-through, which
// is the number that measures whether the script survives contact. Recording
// them used to take two clicks, an outcome then a reason, at the exact moment
// somebody has just been told no and wants the next number.
//
// `label` is what the caller reads on the button. Changing one is safe; changing
// a KEY means a migration on cold_call_dials.outcome and its CHECK constraint.
export const DIAL_OUTCOMES = {
  no_answer: { spoke: false, pitched: false, label: "No answer" },
  // Spoke to them and they do not qualify. Never pitched: disqualifying somebody
  // is not the script being tested.
  not_qualified: { spoke: true, pitched: false, label: "Not qualified" },
  // Said no during the opener, so the pitch never happened.
  opener_no: { spoke: true, pitched: false, label: "Heard opener, said no" },
  // Heard the whole thing and declined. The only no that is a pass-through.
  pitch_no: { spoke: true, pitched: true, label: "Heard pitch, said no" },
  callback: { spoke: true, pitched: true, label: "Call back" },
  booked: { spoke: true, pitched: true, label: "Booked" },
} as const;

export type DialOutcome = keyof typeof DIAL_OUTCOMES;

// The outcomes that end the prospect's time in the dialing operation as a no.
// All three land on the same GoHighLevel stage; what differs is how far the call
// got, which is ours to report on rather than something the board tracks.
export const NO_OUTCOMES = ["not_qualified", "opener_no", "pitch_no"] as const;

export function isNoOutcome(value: unknown): value is (typeof NO_OUTCOMES)[number] {
  return typeof value === "string" && (NO_OUTCOMES as readonly string[]).includes(value);
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
  // How many of the day's calls ended in each kind of no, keyed by outcome. The
  // Objections column is written from this, so "why we lose them" is counted
  // rather than typed.
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
    // Keyed by outcome, not by the retired `reason` column (0078).
    if (isNoOutcome(dial.outcome)) {
      counts.reasons[dial.outcome] = (counts.reasons[dial.outcome] ?? 0) + 1;
    }
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


// The Objections cell: "3 heard opener, said no, 2 not qualified". Commonest
// first, ties falling back to declaration order so the sentence is stable
// between reads.
//
// Counted from the day's no OUTCOMES since 0078. It used to read a separate
// `reason` column, which stopped being written when the reasons became the
// outcomes; leaving it pointed there would have quietly blanked this column
// rather than failing.
//
// Empty string when nothing was recorded, which the grid renders as a blank cell
// rather than as "0 objections".
export function formatObjections(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "";
  const order = NO_OUTCOMES as readonly string[];
  return Object.entries(counts)
    .filter(([key, n]) => n > 0 && isNoOutcome(key))
    .sort(([aKey, a], [bKey, b]) => b - a || order.indexOf(aKey) - order.indexOf(bKey))
    .map(([key, n]) => `${n} ${DIAL_OUTCOMES[key as DialOutcome].label.toLowerCase()}`)
    .join(", ");
}
