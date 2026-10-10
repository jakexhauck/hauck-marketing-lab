// Client side of the Leads board: the payload of /api/pipeline-board and the
// pure rules the board paints with (what is overdue, what needs an answer).
// Server rules live in functions/lib/leadBoard.ts.

export type StageKey =
  | "lead"
  | "estimate"
  | "job"
  | "won"
  | "followUp"
  | "noAnswer"
  | "nurture"
  | "lost"
  | "cancelled"
  | "trash";

export type BookingKind = "estimate" | "job";
export type LostReason = "price" | "timing" | "competitor" | "ghosted" | "diy" | "other";

export interface BoardStage {
  id: string;
  name: string;
  color: string | null;
  key: StageKey | null;
}

export interface BoardLead {
  id: string;
  contactId: string | null;
  name: string;
  phone: string;
  createdAt: string;
  stageId: string;
  value: number | null;
  bookings: { kind: BookingKind; at: string }[];
  followUp: { at: string; note: string } | null;
  lostReason: LostReason | null;
  attempts: number;
}

export interface BoardPayload {
  stages: BoardStage[];
  leads: BoardLead[];
  timezone?: string;
  configError?: "pipeline_not_found";
}

export interface MoveRequest {
  id: string;
  stageId: string;
  at?: string;
  note?: string;
  value?: number;
  lostReason?: LostReason;
}

export const LOST_REASONS: { id: LostReason; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "timing", label: "Timing" },
  { id: "competitor", label: "Competitor" },
  { id: "ghosted", label: "Ghosted" },
  { id: "diy", label: "Did it themselves" },
  { id: "other", label: "Other" },
];
export const lostLabel = (r: LostReason) => LOST_REASONS.find((x) => x.id === r)?.label ?? r;

// A new lead untouched for longer than this counts against speed-to-lead.
export const NEW_LEAD_SLA_MS = 60 * 60_000;

export function stageKeyOf(stages: BoardStage[], stageId: string): StageKey | null {
  return stages.find((s) => s.id === stageId)?.key ?? null;
}

// The booking the card shows: the one matching the stage it sits in.
export function currentBooking(lead: BoardLead, key: StageKey | null) {
  if (key !== "estimate" && key !== "job") return null;
  return lead.bookings.find((b) => b.kind === key) ?? null;
}

const endOfDay = (now: number) => {
  const t = new Date(now);
  t.setHours(23, 59, 59, 999);
  return t.getTime();
};
const sameDay = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString();

export interface LeadFlags {
  staleNew: boolean;
  needsOutcome: boolean;
  followDue: boolean;
  followOverdue: boolean;
  bookedToday: boolean;
}

export function leadFlags(lead: BoardLead, key: StageKey | null, now = Date.now()): LeadFlags {
  const booking = currentBooking(lead, key);
  const fu = carriesFollowUp(key) ? lead.followUp : null;
  return {
    staleNew: key === "lead" && now - Date.parse(lead.createdAt) > NEW_LEAD_SLA_MS,
    needsOutcome: !!booking && Date.parse(booking.at) < now,
    followDue: !!fu && Date.parse(fu.at) <= endOfDay(now),
    followOverdue: !!fu && Date.parse(fu.at) < now,
    bookedToday: !!booking && sameDay(booking.at, now),
  };
}

export type Focus = "new" | "follow" | "today" | "outcome";

export function matchesFocus(focus: Focus, key: StageKey | null, f: LeadFlags): boolean {
  switch (focus) {
    case "new":
      return key === "lead";
    case "follow":
      return f.followDue;
    case "today":
      return f.bookedToday;
    case "outcome":
      return f.needsOutcome;
  }
}

// What a drop on this stage must ask before it can land.
// Follow Up and No Answer both hold a "call again at" time.
export function carriesFollowUp(key: StageKey | null): boolean {
  return key === "followUp" || key === "noAnswer";
}

export type Ask = "none" | "datetime" | "followUp" | "value" | "reason";
export function askFor(key: StageKey | null): Ask {
  switch (key) {
    case "estimate":
    case "job":
      return "datetime";
    case "followUp":
    case "noAnswer":
      return "followUp";
    case "won":
      return "value";
    case "lost":
      return "reason";
    default:
      return "none";
  }
}

// Apply a move to a lead the way the server will, for the optimistic board.
export function applyMoveLocally(lead: BoardLead, key: StageKey | null, m: MoveRequest): BoardLead {
  const next: BoardLead = { ...lead, stageId: m.stageId };
  if (!carriesFollowUp(key)) next.followUp = null;
  if ((key === "estimate" || key === "job") && m.at) {
    next.bookings = [...lead.bookings.filter((b) => b.kind !== key && !(key === "job" && b.kind === "estimate")), { kind: key, at: m.at }];
  }
  if (key === "won") {
    next.bookings = [];
    if (m.value) next.value = m.value;
  }
  if (carriesFollowUp(key) && m.at) next.followUp = { at: m.at, note: (m.note ?? "").trim() };
  if (key === "lost" && m.lostReason) next.lostReason = m.lostReason;
  return next;
}
