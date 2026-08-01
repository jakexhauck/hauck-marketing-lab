import type { AdminLeadStatus } from "./api";

// The stages of the agency's Cold Calling pipeline in GoHighLevel, which are
// also the pages of Cold Call and the lead book's status vocabulary. One list,
// so a page, a stored status and a GHL stage can never mean different things.
//
// Mirrors the CHECK constraint in migration 0076_cold_call_stage_names.sql and
// the server copy in functions/api/admin/tracker/leads.ts.
//
// Verified against the live agency board on 1 August 2026, which reads:
//   New Lead -> No Answer Day 1 -> No Answer Day 2 -> Call Back -> Not Interested
//
// BOOKED IS NOT ON THAT BOARD, and deliberately so: a booked demo moves to the
// separate Sales pipeline at "Demo Call Booked". It is a stage here because the
// book still has to record that a lead has left the dialing operation, but
// nothing should expect to find it on the Cold Calling pipeline.
//
// `tag` is the GHL tag whose automation moves a lead into the stage over there.
// The console writes the tag; GHL decides what it means.

export interface ColdCallStage {
  // URL segment: ?view=<id>
  id: string;
  // The stored status, and the live GHL stage name. Identity, not display:
  // changing one of these means a migration on leads.status, its CHECK
  // constraint, and renaming the stage in GoHighLevel, or the sync stops
  // recognising the board.
  label: AdminLeadStatus;
  // What a person reads. Every surface renders this: the page strip, the status
  // pill (via STATUS_META in adminLeads.ts) and the page headings. So a stage
  // can be renamed for humans without touching what is stored anywhere.
  short: string;
  meaning: string;
  tag: string | null;
  // Does this stage get the calling queue (a list on the left, the person being
  // called on the right, four outcome buttons)? The rest are lists you read.
  queue: boolean;
  // Does this stage get a page in the strip? Not Interested does not: it is a
  // dead list nobody works, and a tab for it was a page opened by accident.
  //
  // The OUTCOME is untouched. "Not interested" is still a button on the call
  // card, still tags the contact, and GoHighLevel still moves it into that
  // stage. This flag decides what is worth reading, not what is worth recording.
  page: boolean;
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
    page: true,
    terminal: false,
    swatch: "#6366f1",
  },
  {
    id: "first-dial",
    label: "No Answer Day 1",
    short: "No Answer Day 1",
    meaning: "Dialed once, no answer. Dial again today.",
    tag: "cc no answer day 1",
    queue: true,
    page: true,
    terminal: false,
    swatch: "#0ea5e9",
  },
  {
    id: "second-dial",
    label: "No Answer Day 2",
    short: "No Answer Day 2",
    meaning: "Dialed twice, still no answer. Last attempt before nurture.",
    tag: "cc no answer day 2",
    queue: true,
    page: true,
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
    page: true,
    terminal: false,
    swatch: "#8b5cf6",
  },
  {
    id: "booked",
    label: "Booked",
    short: "Booked",
    meaning:
      "Meetings set. Upcoming first, then the ones that have been. Booked leads live on the Sales pipeline in GoHighLevel, not this one.",
    tag: "cc demo call booked",
    queue: false,
    page: true,
    terminal: true,
    swatch: "#10b981",
  },
  {
    id: "not-interested",
    label: "Not Interested",
    short: "Not Int.",
    meaning: "A hard no. Recorded and tagged, but it has no page: nobody works this list.",
    tag: "cc not interested",
    queue: false,
    page: false,
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
  return attempts >= 2 ? "No Answer Day 2" : "No Answer Day 1";
}
