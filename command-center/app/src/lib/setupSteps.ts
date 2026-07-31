// The client setup steps, as the app now holds them: rows, not code.
//
// Two sections, GoHighLevel and Meta ads, each a list of checkboxes against one
// client. The rows are edited in Onboarding > Management, so this file is the
// shape and the rules rather than the content.
//
// The content is still in clientSetup.ts, demoted to a seed: the first read of
// an empty table writes those steps in. That way a fresh database starts with
// Jake's real process instead of an empty page, and editing it afterwards never
// fights with the code.

import { SETUP_PHASES, SETUP_STEPS, type SetupPhaseKey } from "./clientSetup";

export type SetupSection = "kickoff" | "call" | "ghl" | "ads";

export interface SetupSectionDef {
  id: SetupSection;
  label: string;
  blurb: string;
}

// The order here is the order on the page, and it is the order the work happens
// in: sign them, call them, build them, launch them.
export const SETUP_SECTIONS: SetupSectionDef[] = [
  {
    id: "kickoff",
    label: "Kickoff",
    blurb: "The moment they sign, before anything is built.",
  },
  {
    id: "call",
    label: "Onboarding call",
    blurb: "One sitting, with them on the phone.",
  },
  {
    id: "ghl",
    label: "GoHighLevel",
    blurb: "Their sub-account, wired and verified.",
  },
  {
    id: "ads",
    label: "Meta ads",
    blurb: "From the onboarding call to live campaigns.",
  },
];

const SECTION_IDS = new Set<string>(SETUP_SECTIONS.map((s) => s.id));

export function isSetupSection(value: unknown): value is SetupSection {
  return typeof value === "string" && SECTION_IDS.has(value);
}

/** One step, as it comes back from the API. */
export interface SetupStepRow {
  id: string;
  section: SetupSection;
  groupLabel: string | null;
  label: string;
  note: string | null;
  position: number;
  required: boolean;
  /** Set only on the steps the live GoHighLevel checks tick by themselves. */
  code: string | null;
}

/** What a live GHL readiness check answers, by step code. */
export const READINESS_CODES: Record<string, string> = {
  token: "token-connected",
  custom_values: "provision-values",
  calendars: "calendars-present",
};

export const MAX_LABEL = 200;
export const MAX_NOTE = 600;
export const MAX_GROUP = 80;

export interface StepPatch {
  section?: SetupSection;
  groupLabel?: string | null;
  label?: string;
  note?: string | null;
  position?: number;
  required?: boolean;
}

export interface PatchResult {
  patch: Record<string, unknown>;
  error: string | null;
}

/**
 * What of a submitted edit we are willing to write.
 *
 * An allow-list, not a filter: anything not named here never reaches the row, so
 * no request can set `code` and steal another step's auto-tick wiring, or flip
 * `archived` by a route that is meant to edit text.
 */
export function validateStepPatch(input: unknown): PatchResult {
  const patch: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return { patch, error: "invalid body" };
  const body = input as Record<string, unknown>;

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return { patch, error: "A step needs a name." };
    patch.label = label.slice(0, MAX_LABEL);
  }

  if ("section" in body) {
    if (!isSetupSection(body.section)) return { patch, error: "Unknown section." };
    patch.section = body.section;
  }

  if ("note" in body) {
    const note = typeof body.note === "string" ? body.note.trim() : "";
    patch.note = note ? note.slice(0, MAX_NOTE) : null;
  }

  if ("groupLabel" in body) {
    const group = typeof body.groupLabel === "string" ? body.groupLabel.trim() : "";
    patch.group_label = group ? group.slice(0, MAX_GROUP) : null;
  }

  if ("required" in body) {
    if (typeof body.required !== "boolean") return { patch, error: "invalid required" };
    patch.required = body.required;
  }

  if ("position" in body) {
    const n = Number(body.position);
    if (!Number.isFinite(n)) return { patch, error: "invalid position" };
    patch.position = Math.max(0, Math.trunc(n));
  }

  if (Object.keys(patch).length === 0) return { patch, error: "nothing to change" };
  return { patch, error: null };
}

// --- The seed ----------------------------------------------------------------

export interface SeedRow {
  section: SetupSection;
  group_label: string | null;
  label: string;
  note: string | null;
  position: number;
  required: boolean;
  code: string | null;
}

/**
 * Which section a phase's steps land in.
 *
 * Kickoff, the call and the GoHighLevel build are each one section. The seven
 * days of the ads pipeline are one section between them, because they are one
 * run of work rather than seven, and the day survives as a subheading.
 */
const SECTION_BY_PHASE: Record<SetupPhaseKey, SetupSection> = {
  kickoff: "kickoff",
  call: "call",
  ghl: "ghl",
  day1: "ads",
  day2: "ads",
  day34: "ads",
  day56: "ads",
  day7: "ads",
};

/**
 * The steps a section starts with: Jake's own processes.
 *
 * A section is seeded once, the first time it is asked for, and is the client's
 * to edit from then on. See the GET handler: it compares the sections present in
 * the table against these, so a section added here arrives on the next page load
 * without a migration, and one already in the table is never re-seeded.
 */
export function seedRows(): SeedRow[] {
  return SETUP_STEPS.map((step, index) => {
    const section = SECTION_BY_PHASE[step.phase];
    const phase = SETUP_PHASES.find((p) => p.key === step.phase);
    return {
      section,
      // A step may name its own subheading (the call, which moves between four
      // systems in one sitting). Otherwise the ads section keeps its days, and
      // the single-list sections have none.
      group_label: step.group ?? (section === "ads" ? (phase?.label ?? null) : null),
      label: step.label,
      note: step.note ?? null,
      // Spaced so a step can be dropped between two without renumbering.
      position: (index + 1) * 10,
      required: Boolean(step.required),
      code: step.auto ? step.key : null,
    };
  });
}

// --- Shaping -----------------------------------------------------------------

export interface StepGroup {
  label: string | null;
  steps: SetupStepRow[];
}

/** One section's steps, in order, grouped by their subheading. */
export function groupSteps(steps: SetupStepRow[], section: SetupSection): StepGroup[] {
  const mine = steps
    .filter((s) => s.section === section)
    .sort((a, b) => a.position - b.position);

  const out: StepGroup[] = [];
  for (const step of mine) {
    const label = step.groupLabel || null;
    const last = out[out.length - 1];
    // Consecutive steps sharing a subheading share a group. Not a lookup by
    // name: the same heading used twice, far apart, is two groups, which is
    // what the order says and therefore what Jake meant.
    if (last && last.label === label) last.steps.push(step);
    else out.push({ label, steps: [step] });
  }
  return out;
}

export interface SectionProgress {
  done: number;
  total: number;
  pct: number;
}

export function sectionProgress(
  steps: SetupStepRow[],
  section: SetupSection,
  doneIds: Set<string>,
): SectionProgress {
  const mine = steps.filter((s) => s.section === section);
  const done = mine.filter((s) => doneIds.has(s.id)).length;
  return {
    done,
    total: mine.length,
    pct: mine.length === 0 ? 0 : Math.round((done / mine.length) * 100),
  };
}

/** Required steps not yet done, across every section. Empty means ready. */
export function blockingSteps(steps: SetupStepRow[], doneIds: Set<string>): SetupStepRow[] {
  return steps.filter((s) => s.required && !doneIds.has(s.id));
}

/** The shape the Go Live gate needs, which the server reads straight off the table. */
export interface GateStep {
  id: string;
  label: string;
  required: boolean;
  code: string | null;
}

/**
 * What still stands between a client and Go Live, counted on the server.
 *
 * The same rule as blockingSteps with one deliberate difference: a step with a
 * `code` is ticked by the live GoHighLevel checks, and this request cannot run
 * those checks. Counting them here would mean a client could never go live,
 * which is exactly the bug this replaced. The browser still gates on them, so
 * the auto steps are a warning rather than a lock, and every step a human ticks
 * is enforced.
 */
export function outstandingRequired(steps: GateStep[], doneIds: Set<string>): GateStep[] {
  return steps.filter((s) => s.required && !s.code && !doneIds.has(s.id));
}

/** The next free position in a section, so a new step lands at the end. */
export function nextPosition(steps: SetupStepRow[], section: SetupSection): number {
  const mine = steps.filter((s) => s.section === section);
  if (mine.length === 0) return 10;
  return Math.max(...mine.map((s) => s.position)) + 10;
}

// --- Reordering --------------------------------------------------------------

export interface PositionWrite {
  id: string;
  position: number;
}

/**
 * Move a step within its section, as a list of positions to write.
 *
 * Usually one row. Positions are spaced ten apart, so a step dropped between two
 * others takes the midpoint and its neighbours are left alone: reordering forty
 * steps should not be forty writes.
 *
 * When there is no room between two neighbours (they ended up adjacent after
 * enough moves), the whole section is renumbered back onto a clean ten-spaced
 * ladder. That is the rare case, and it is better than inventing fractional
 * positions the column cannot hold.
 */
export function moveStep(
  ordered: SetupStepRow[],
  fromIndex: number,
  toIndex: number,
): PositionWrite[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length
  ) {
    return [];
  }

  const next = [...ordered];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  const before = next[toIndex - 1];
  const after = next[toIndex + 1];

  const renumber = () => next.map((s, i) => ({ id: s.id, position: (i + 1) * 10 }));

  // To the top: sit above the first, if there is room above it.
  if (!before) {
    if (!after) return [];
    return after.position > 1
      ? [{ id: moved.id, position: Math.max(1, Math.floor(after.position / 2)) }]
      : renumber();
  }

  // To the bottom: simply past the last.
  if (!after) return [{ id: moved.id, position: before.position + 10 }];

  const gap = after.position - before.position;
  if (gap < 2) return renumber();
  return [{ id: moved.id, position: before.position + Math.floor(gap / 2) }];
}
