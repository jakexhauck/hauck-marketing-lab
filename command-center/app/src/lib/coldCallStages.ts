import type { AdminLeadStatus } from "./api";

// The stages of the agency's Cold Calling pipeline in GoHighLevel, which are
// also the columns of Cold Call > Pipeline and the lead book's status
// vocabulary. One list, so a column, a stored status and a GHL stage can never
// mean different things.
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
  // Stable id for the stage. It was the ?view= segment when each stage had its
  // own page; it is now what an old link to one of those pages is matched on.
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
    terminal: false,
    swatch: "#6366f1",
  },
  {
    id: "first-dial",
    label: "No Answer Day 1",
    short: "No Answer Day 1",
    meaning: "Dialed once, no answer. Dial again today.",
    tag: "cc no answer day 1",
    terminal: false,
    swatch: "#0ea5e9",
  },
  {
    id: "second-dial",
    label: "No Answer Day 2",
    short: "No Answer Day 2",
    meaning: "Dialed twice, still no answer. Last attempt before nurture.",
    tag: "cc no answer day 2",
    terminal: false,
    swatch: "#f59e0b",
  },
  {
    id: "call-back",
    label: "Call Back",
    short: "Call Back",
    meaning: "Asked to be called at a set time. Overdue sorts to the top.",
    tag: "cc call back",
    terminal: false,
    swatch: "#8b5cf6",
  },
  {
    id: "booked",
    label: "Booked",
    short: "Booked",
    meaning:
      "A meeting is set. Booked leads live on the Sales pipeline in GoHighLevel, not this one.",
    tag: "cc demo call booked",
    terminal: true,
    swatch: "#10b981",
  },
  {
    id: "not-interested",
    label: "Not Interested",
    short: "Not Int.",
    meaning: "A hard no. Recorded and tagged, and the board's last column.",
    tag: "cc not interested",
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
