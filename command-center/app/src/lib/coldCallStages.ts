// The Cold Call Leads pipeline, mirrored from the agency GHL sub-account
// (location wbrjjHYzznyEHx9wumSr), pulled live 2026-07-26.
//
// One page per stage: this list drives the stage strip, the page bodies, the
// table's stage pill and the status popover, so renaming a stage is a one-line
// change here. The `label` is also the value stored in the lead book's `status`
// column, which is why AdminLeadStatus is derived from it.
//
// `tag` is the GHL tag whose automation moves a lead into that stage. The app
// does not write tags yet; it is recorded here so the write-back pass has one
// place to read from. New Lead has no tag: nothing marks a lead that has never
// been dialed.

export type ColdCallStageId =
  | "new-lead"
  | "first-dial"
  | "second-dial"
  | "brushed-off"
  | "call-back"
  | "booked"
  | "not-interested";

// The strip also carries the hand-typed daily dialing sheet. It is a page in the
// same strip but it is not a pipeline stage, so it is typed separately.
export const TRACKER_ID = "tracker";
export type ColdCallPageId = ColdCallStageId | typeof TRACKER_ID;

export interface ColdCallStage {
  id: ColdCallStageId;
  // The exact GHL stage name. Also the stored lead status.
  label: string;
  // The tile label: short enough to sit in a seven-across strip.
  short: string;
  // One line under the page title saying what being in this stage means.
  meaning: string;
  // The GHL tag that drives the move into this stage, null when none exists.
  tag: string | null;
  // Tile and pill modifier classes, styled in the shared Bento Bold sheet.
  tileClass: string;
  pillClass: string;
  swatch: string;
}

export const COLD_CALL_STAGES: ColdCallStage[] = [
  {
    id: "new-lead",
    label: "New Lead",
    short: "New Lead",
    meaning: "Sourced and never dialed. Start here.",
    tag: null,
    tileClass: "t-newlead",
    pillClass: "st-newlead",
    swatch: "#6366f1",
  },
  {
    id: "first-dial",
    label: "1st Dial (Day 1)",
    short: "1st Dial",
    meaning: "Dialed once, no answer. Dial again tomorrow.",
    tag: "cc no answer day 1",
    tileClass: "t-dial1",
    pillClass: "st-dial1",
    swatch: "#0ea5e9",
  },
  {
    id: "second-dial",
    label: "2nd Dial (Day 2)",
    short: "2nd Dial",
    meaning: "Dialed twice, still no answer. Last automated attempt.",
    tag: "cc no answer day 2",
    tileClass: "t-dial2",
    pillClass: "st-dial2",
    swatch: "#f59e0b",
  },
  {
    id: "brushed-off",
    label: "Brushed Off",
    short: "Brushed Off",
    meaning: "Picked up but would not engage. Worth one more angle.",
    tag: "cc brush off",
    tileClass: "t-brushed",
    pillClass: "st-brushed",
    swatch: "#14b8a6",
  },
  {
    id: "call-back",
    label: "Call Back",
    short: "Call Back",
    meaning: "Asked to be called at a set time. Honour the time.",
    tag: "cc call back",
    tileClass: "t-callback",
    pillClass: "st-callback",
    swatch: "#8b5cf6",
  },
  {
    id: "booked",
    label: "Booked",
    short: "Booked",
    meaning: "Demo call on the calendar. Confirm before it lands.",
    tag: "cc demo call booked",
    tileClass: "t-booked",
    pillClass: "st-booked",
    swatch: "#10b981",
  },
  {
    id: "not-interested",
    label: "Not Interested",
    short: "Not Int.",
    meaning: "A hard no. Kept for the record, not for dialing.",
    tag: "cc not interested",
    tileClass: "t-notint",
    pillClass: "st-notint",
    swatch: "#c78b93",
  },
];

// The stored status vocabulary, in pipeline order.
export const STAGE_LABELS: string[] = COLD_CALL_STAGES.map((s) => s.label);

const BY_ID = new Map<string, ColdCallStage>(COLD_CALL_STAGES.map((s) => [s.id, s]));
const BY_LABEL = new Map<string, ColdCallStage>(COLD_CALL_STAGES.map((s) => [s.label, s]));

export function stageById(id: string | null | undefined): ColdCallStage | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

// Resolve a stored lead status. Returns null for a status from the retired
// vocabulary, so callers render it as unknown rather than guessing a stage.
export function stageByLabel(label: string | null | undefined): ColdCallStage | null {
  return label ? (BY_LABEL.get(label) ?? null) : null;
}

// Resolve a raw ?stage= value to a page id, defaulting to the first stage.
export function resolveStageId(param: string | null | undefined): ColdCallPageId {
  if (param === TRACKER_ID) return TRACKER_ID;
  return stageById(param)?.id ?? COLD_CALL_STAGES[0].id;
}
