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
//
// `counts` is whether the row is a DIAL. It is true for everything except
// not_in_niche, and that exception is the whole reason the flag exists (0117):
// a business that is not in a trade we sell to was never a prospect, so ringing
// it measures the list, not the day's work. Counting it made a shift look busier
// the worse its list was, which is backwards. Everything else counts, including
// not_qualified: somebody who could have bought and does not is a call that
// happened, and a pending row is a call the phone system provably placed.
export const DIAL_OUTCOMES = {
  no_answer: { spoke: false, pitched: false, counts: true, label: "No answer" },
  // Spoke to them and they do not qualify. Never pitched: disqualifying somebody
  // is not the script being tested.
  not_qualified: { spoke: true, pitched: false, counts: true, label: "Not qualified" },
  // The wrong business entirely: a trade we do not sell to, on the list by
  // mistake. Not a pickup, not a pitch, and not a dial (see `counts` above).
  not_in_niche: { spoke: false, pitched: false, counts: false, label: "Not my niche" },
  // Said no during the opener, so the pitch never happened.
  opener_no: { spoke: true, pitched: false, counts: true, label: "Heard opener, said no" },
  // Heard the whole thing and declined. The only no that is a pass-through.
  pitch_no: { spoke: true, pitched: true, counts: true, label: "Heard pitch, said no" },
  // The front desk would not put us through. A real prospect, really rung, so
  // it is a call made; not a pickup, because the person we rang to speak to
  // never came to the phone (Jake, 2026-08-25). It is not one of the three nos
  // either: nobody has told us anything about the offer yet.
  gatekeeper: { spoke: false, pitched: false, counts: true, label: "Gatekeeper" },
  callback: { spoke: true, pitched: true, counts: true, label: "Call back" },
  booked: { spoke: true, pitched: true, counts: true, label: "Booked" },
} as const;

export type DialOutcome = keyof typeof DIAL_OUTCOMES;

// The outcomes that end the prospect's time in the dialing operation as a no.
// All three land on the same GoHighLevel stage; what differs is how far the call
// got, which is ours to report on rather than something the board tracks.
export const NO_OUTCOMES = ["not_qualified", "opener_no", "pitch_no"] as const;

// The outcomes that end a prospect's time on the board WITHOUT counting as a
// call. Deliberately not in NO_OUTCOMES: those three are objections, read back
// as "why we lose them", and "they were never in our market" is not one of them.
export const UNCOUNTED_OUTCOMES = ["not_in_niche"] as const;

export type UncountedOutcome = (typeof UNCOUNTED_OUTCOMES)[number];

// Every press that ends the prospect's time on the board there and then.
//
// The three nos, the wrong trade, and the gatekeeper. What they have in common
// is the WRITE, not the meaning: one press, the prospect leaves the dialing
// operation, and nothing is scheduled. Call back and Booked are deliberately
// not here, because both leave a next step behind.
export const ENDING_OUTCOMES = [...NO_OUTCOMES, ...UNCOUNTED_OUTCOMES, "gatekeeper"] as const;

export type EndingOutcome = (typeof ENDING_OUTCOMES)[number];

// The outcomes the day's breakdown counts, which is what the tracker's
// Objections column is written from.
//
// The three nos say why we lost them. The gatekeeper says we never got to find
// out, and Jake asked for that number on 2026-08-25: it is the difference
// between a script that is not working and a list we cannot get past.
export const REPORTED_REASONS = [...NO_OUTCOMES, "gatekeeper"] as const;

export function isReportedReason(value: unknown): value is (typeof REPORTED_REASONS)[number] {
  return typeof value === "string" && (REPORTED_REASONS as readonly string[]).includes(value);
}

// Does this row count as a dial?
//
// The single answer to that question. Read by the day counter on the dialing
// page, by the tracker's monthly rollup and by the per-script stats, so a call
// cannot be in one of those totals and out of another.
//
// An outcome the app does not recognise counts. That is the safe direction: a
// row we cannot explain still represents a call somebody made, and dropping it
// would quietly shrink the day.
export function countsAsDial(outcome: unknown): boolean {
  if (!isDialOutcome(outcome)) return true;
  return DIAL_OUTCOMES[outcome].counts;
}

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
    // A row that is not a dial is not anything else either: it never reaches
    // the day, so a day of nothing but wrong-trade numbers stays empty rather
    // than reporting zero calls made.
    if (!countsAsDial(dial.outcome)) continue;
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
    if (isReportedReason(dial.outcome)) {
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
  const order = REPORTED_REASONS as readonly string[];
  return Object.entries(counts)
    .filter(([key, n]) => n > 0 && isReportedReason(key))
    .sort(([aKey, a], [bKey, b]) => b - a || order.indexOf(aKey) - order.indexOf(bKey))
    .map(([key, n]) => `${n} ${DIAL_OUTCOMES[key as DialOutcome].label.toLowerCase()}`)
    .join(", ");
}
