import type { AdminLeadStatus } from "./api";

// The stages of the agency's Cold Calling pipeline in GoHighLevel, which are
// also the pages of Cold Call and the lead book's status vocabulary. One list,
// so a page, a stored status and a GHL stage can never mean different things.
//
// Mirrors the CHECK constraint in migration 0055 and the server copy in
// functions/api/admin/tracker/leads.ts.
//
// `tag` is the GHL tag whose automation moves a lead into the stage over there.
// The console writes the tag; GHL decides what it means.

export interface ColdCallStage {
  // URL segment: ?view=<id>
  id: string;
  // The stored status, and the live GHL stage name.
  label: AdminLeadStatus;
  // Strip label: short enough to sit in a ten-item row.
  short: string;
  meaning: string;
  tag: string | null;
  // Does this stage get the calling queue (a list on the left, the person being
  // called on the right, four outcome buttons)? The rest are lists you read.
  queue: boolean;
  // Has the lead left the dialing operation? Booked and Not Interested have;
  // everything else is still work in progress.
  terminal: boolean;
  swatch: string;
}

export const COLD_CALL_STAGES: ColdCallStage[] = [
  {
    id: "new-lead",
    label: "New Lead",
    short: "New Lead",
    meaning: "Sourced and never dialed. Start here.",
    tag: null,
    queue: true,
    terminal: false,
    swatch: "#6366f1",
  },
  {
    id: "first-dial",
    label: "1st Dial (Day 1)",
    short: "1st Dial",
    meaning: "Dialed once, no answer. Dial again today.",
    tag: "cc no answer day 1",
    queue: true,
    terminal: false,
    swatch: "#0ea5e9",
  },
  {
    id: "second-dial",
    label: "2nd Dial (Day 2)",
    short: "2nd Dial",
    meaning: "Dialed twice, still no answer. Last attempt before nurture.",
    tag: "cc no answer day 2",
    queue: true,
    terminal: false,
    swatch: "#f59e0b",
  },
  {
    id: "call-back",
    label: "Call Back",
    short: "Call Back",
    meaning: "Asked to be called at a set time. Overdue sorts to the top.",
    tag: "cc call back",
    queue: true,
    terminal: false,
    swatch: "#8b5cf6",
  },
  {
    id: "booked",
    label: "Booked",
    short: "Booked",
    meaning: "Meetings set. Upcoming first, then the ones that have been.",
    tag: "cc demo call booked",
    queue: false,
    terminal: true,
    swatch: "#10b981",
  },
  {
    id: "not-interested",
    label: "Not Interested",
    short: "Not Int.",
    meaning: "A hard no. Kept for the record, not for dialing.",
    tag: "cc not interested",
    queue: false,
    terminal: true,
    swatch: "#c78b93",
  },
];

// The stored vocabulary, in pipeline order.
export const STAGE_LABELS: AdminLeadStatus[] = COLD_CALL_STAGES.map((s) => s.label);

const BY_ID = new Map(COLD_CALL_STAGES.map((s) => [s.id, s]));
const BY_LABEL = new Map(COLD_CALL_STAGES.map((s) => [s.label as string, s]));

export function stageById(id: string | null | undefined): ColdCallStage | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

// Null for a status from the retired vocabulary, so a stale row renders as
// unknown rather than being filed under a stage it was never in.
export function stageByLabel(label: string | null | undefined): ColdCallStage | null {
  return label ? (BY_LABEL.get(label) ?? null) : null;
}

// Where a lead goes after nobody answers. The two dial stages exist to make
// exactly this distinction, so it is driven by the attempt count rather than by
// which page the caller happened to be on: attempt 1 lands on Day 1, everything
// after that on Day 2, which is the last automated attempt.
export function stageAfterNoAnswer(attempts: number): AdminLeadStatus {
  return attempts >= 2 ? "2nd Dial (Day 2)" : "1st Dial (Day 1)";
}
