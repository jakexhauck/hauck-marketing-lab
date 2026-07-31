// What one live sales call is holding: which prompts have been covered, what
// was typed under each, and when the clock started.
//
// The PROMPTS themselves are not here. They were, for exactly as long as it took
// to agree the shape of the page; they are now rows in sales_playbook_items
// (0074), edited on Sales > Playbook, and their sections live in
// functions/lib/salesPlaybook.ts beside the endpoint that validates them.
//
// What is left is the per-call scratchpad, which is a browser concern and has no
// business in the database: ticks and half-typed notes for a call in progress,
// thrown away the moment an outcome is recorded.
//
// Pure: no React, no storage, no Date.now(). The page owns reading and writing.

export interface CallState {
  // Epoch ms the timer started. Kept rather than recomputed so a mid-call
  // refresh does not restart the clock at zero.
  startedAt: number;
  // Playbook item ids covered. An array rather than a Set so it survives JSON.
  ticked: string[];
  // Item id -> what was typed under it.
  notes: Record<string, string>;
}

export function emptyCallState(startedAt: number): CallState {
  return { startedAt, ticked: [], notes: {} };
}

// Where one call's state lives. Keyed by meeting so yesterday's ticks never
// appear on today's prospect.
export function callStateKey(meetingId: string): string {
  return `hml_oncall_${meetingId}`;
}

// Read stored state back, dropping anything the playbook no longer has.
//
// `known` is the ids of the prompts currently on the playbook. A prompt Jake
// retires mid-call leaves a tick and a note behind in the browser; keeping them
// would let a column report "6/5 covered" and would hold text nothing on the
// page can show again, so both are dropped on read.
export function normalizeCallState(
  raw: unknown,
  fallbackStartedAt: number,
  known: readonly string[],
): CallState {
  const ids = new Set(known);
  const state = emptyCallState(fallbackStartedAt);
  if (!raw || typeof raw !== "object") return state;

  const obj = raw as Partial<CallState>;

  if (typeof obj.startedAt === "number" && Number.isFinite(obj.startedAt)) {
    state.startedAt = obj.startedAt;
  }

  if (Array.isArray(obj.ticked)) {
    state.ticked = obj.ticked.filter((id): id is string => typeof id === "string" && ids.has(id));
  }

  if (obj.notes && typeof obj.notes === "object") {
    for (const [id, value] of Object.entries(obj.notes)) {
      if (ids.has(id) && typeof value === "string" && value !== "") state.notes[id] = value;
    }
  }

  return state;
}

// How far through a column you are. The denominator is what is on the playbook
// now, so a column always reads "n of what there is".
export function sectionProgress(
  items: readonly { id: string }[],
  ticked: readonly string[],
): { covered: number; total: number } {
  const set = new Set(ticked);
  return {
    covered: items.filter((i) => set.has(i.id)).length,
    total: items.length,
  };
}

// The running clock, as mm:ss (or h:mm:ss once a call passes the hour).
//
// Clamped at zero: a clock stored ahead of now (a machine whose time moved)
// must read 0:00 rather than a negative.
export function elapsedLabel(startedAt: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const s = seconds % 60;
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
