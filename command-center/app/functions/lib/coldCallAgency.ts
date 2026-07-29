import {
  rollUpDialsByDay,
  type DialRow,
  type RecordedCounts,
  type TrackerDay,
  type TypedDay,
} from "./coldCallDials";

// The agency's cold call month: every caller's day, combined into one row per
// day. Pure, no Supabase, no Request, so the arithmetic behind an agency total
// is unit-tested rather than argued about.
//
// This is the "Agency" option on Acquisition > Cold Call. It is NOT Sales > Cold
// Call Data, which is the same month measured and only measured. The difference
// is the one rule this file exists for: a caller's typed cells are resolved
// BEFORE the callers are summed, so the agency total equals the sum of what the
// individual trackers show. An agency figure smaller than the sum of its people
// would be a bug wearing the clothes of a policy.
//
// Resolution has to happen here rather than in the client, because the client
// only ever receives one row per day and cannot un-mix two people from a sum.

// A typed row with its owner attached (cold_calls carries caller_id).
export interface AgencyTypedRow extends TypedDay {
  callerId: string;
}

// One logged attempt with its owner attached (cold_call_dials likewise).
export interface AgencyDialRow extends DialRow {
  callerId: string;
}

export interface AgencyMonth {
  // One row per day that somebody worked, ascending. Days nobody worked are
  // absent, exactly as they are for one caller, so the client's blank template
  // still renders a quiet week as blanks rather than as zeroes.
  days: TrackerDay[];
  // How many people contributed anything to this month.
  callers: number;
  // Days where at least one caller typed at least one count. Surfaced so the
  // page can say that a sum contains hand-entered dialing instead of letting it
  // read as pure measurement.
  typedDays: number;
}

const COUNTS = ["callsMade", "pickups", "passThrough", "meetingsBooked"] as const;

type CountField = (typeof COUNTS)[number];

// One caller's day, after the typed cells have had their say. A count is null
// only when neither the app nor a keyboard offered one, which is what keeps a
// column blank instead of contributing a fabricated 0 to the agency sum.
interface ResolvedDay {
  counts: Record<CountField, number | null>;
  reasons: Record<string, number>;
  // Did a human type any of these four numbers.
  typed: boolean;
}

function resolveDay(typed: TypedDay | null, recorded: RecordedCounts | null): ResolvedDay {
  const counts = {} as Record<CountField, number | null>;
  let wasTyped = false;
  for (const field of COUNTS) {
    const hand = typed ? typed[field] : null;
    if (hand !== null && hand !== undefined) {
      counts[field] = hand;
      wasTyped = true;
    } else {
      counts[field] = recorded ? recorded[field] : null;
    }
  }
  // Typed objections are prose and are deliberately dropped: five callers'
  // sentences do not merge into one. The counted reasons do, so those are what
  // the agency's Objections column is built from.
  return { counts, reasons: recorded?.reasons ?? {}, typed: wasTyped };
}

// Combine a month of typed rows and logged dials, from any number of callers,
// into one row per day.
export function aggregateAgencyMonth(
  typedRows: AgencyTypedRow[],
  dials: AgencyDialRow[],
): AgencyMonth {
  // Each caller's dials, rolled up by the same function the caller's own tracker
  // uses, so the two pages can never disagree about what a pickup is.
  const dialsByCaller = new Map<string, AgencyDialRow[]>();
  for (const dial of dials) {
    const id = dial.callerId || "unassigned";
    const list = dialsByCaller.get(id);
    if (list) list.push(dial);
    else dialsByCaller.set(id, [dial]);
  }
  const recordedByCaller = new Map<string, Record<string, RecordedCounts>>();
  for (const [id, list] of dialsByCaller) {
    recordedByCaller.set(id, rollUpDialsByDay(list));
  }

  // Each caller's typed rows, keyed by day.
  const typedByCaller = new Map<string, Map<string, TypedDay>>();
  for (const row of typedRows) {
    const id = row.callerId || "unassigned";
    const byDay = typedByCaller.get(id) ?? new Map<string, TypedDay>();
    byDay.set(row.day, row);
    typedByCaller.set(id, byDay);
  }

  const callerIds = new Set<string>([...recordedByCaller.keys(), ...typedByCaller.keys()]);

  // day -> the running sum, plus whether a count has been offered at all.
  interface DaySum {
    counts: Record<CountField, number | null>;
    reasons: Record<string, number>;
    typed: boolean;
  }
  const byDay = new Map<string, DaySum>();
  const contributing = new Set<string>();

  for (const callerId of callerIds) {
    const recorded = recordedByCaller.get(callerId) ?? {};
    const typed = typedByCaller.get(callerId) ?? new Map<string, TypedDay>();
    const days = new Set<string>([...Object.keys(recorded), ...typed.keys()]);

    for (const day of days) {
      const resolved = resolveDay(typed.get(day) ?? null, recorded[day] ?? null);

      // A row that resolves to nothing at all (a typed row holding only notes,
      // say) must not stand a day up on its own: an all-blank agency row is a
      // day nobody dialled.
      const hasAnything =
        COUNTS.some((f) => resolved.counts[f] !== null) ||
        Object.keys(resolved.reasons).length > 0;
      if (!hasAnything) continue;

      contributing.add(callerId);

      const sum =
        byDay.get(day) ??
        ({
          counts: { callsMade: null, pickups: null, passThrough: null, meetingsBooked: null },
          reasons: {},
          typed: false,
        } satisfies DaySum);

      for (const field of COUNTS) {
        const value = resolved.counts[field];
        if (value === null) continue;
        sum.counts[field] = (sum.counts[field] ?? 0) + value;
      }
      for (const [reason, n] of Object.entries(resolved.reasons)) {
        sum.reasons[reason] = (sum.reasons[reason] ?? 0) + n;
      }
      if (resolved.typed) sum.typed = true;

      byDay.set(day, sum);
    }
  }

  const days: TrackerDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, sum]) => ({
      // Marked so nothing downstream mistakes an aggregate for a cold_calls
      // primary key: there is no row here to update, and there never will be.
      id: `agency:${day}`,
      day,
      // The four typed fields stay null on purpose. The sums travel in
      // `recorded`, which is what makes the client render them without marking
      // every cell as hand-typed: "typed" is a fact about one caller's cell and
      // means nothing about a sum of five.
      callsMade: null,
      pickups: null,
      passThrough: null,
      meetingsBooked: null,
      objections: null,
      notes: null,
      recorded: {
        // A column no caller offered a number for reads 0 rather than blank once
        // the day exists at all: the day WAS worked, so a missing count is a
        // measured nothing. The rates divide through safeDivide and show "-"
        // rather than 0% when their denominator is one of these.
        callsMade: sum.counts.callsMade ?? 0,
        pickups: sum.counts.pickups ?? 0,
        passThrough: sum.counts.passThrough ?? 0,
        meetingsBooked: sum.counts.meetingsBooked ?? 0,
        reasons: sum.reasons,
      },
    }));

  return {
    days,
    callers: contributing.size,
    typedDays: [...byDay.values()].filter((d) => d.typed).length,
  };
}
