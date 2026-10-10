// The Leads board: which pipeline it sits on, which stage is which, and what a
// move to each stage asks for and writes. Pure, so every drop rule is tested
// without GHL or Supabase. The endpoints in api/pipeline-board/ carry it out.
//
// Stages are matched BY NAME, never by stored id, so a client set up from the
// Test v2 snapshot works with nothing typed per client.

import { normalizeStageName } from "./salesPipeline";

export type StageKey =
  | "lead"
  | "estimate"
  | "job"
  | "won"
  | "followUp"
  | "nurture"
  | "lost"
  | "cancelled"
  | "trash";

export type LostReason = "price" | "timing" | "competitor" | "ghosted" | "diy" | "other";
export const LOST_REASONS: readonly LostReason[] = ["price", "timing", "competitor", "ghosted", "diy", "other"];

export type BookingKind = "estimate" | "job";

export interface BoardStage {
  id: string;
  name: string;
  color: string | null;
  key: StageKey | null;
}

export interface BoardPipeline {
  pipelineId: string;
  stages: BoardStage[];
}

// Normalised stage name -> key. Exact matches only (after normalising), so a
// stage such as "Job Completed" is never read as "Job Booked".
const KEY_BY_NAME: Record<string, StageKey> = {
  lead: "lead",
  newlead: "lead",
  estimatebooked: "estimate",
  jobbooked: "job",
  won: "won",
  // Test v2 renamed Won to Job Completed (2026-10-08): the stage a lead lands
  // in once the work is done and paid, which is what Revenue counts.
  jobcompleted: "won",
  followup: "followUp",
  longtermnurture: "nurture",
  lost: "lost",
  jobestimatecancelled: "cancelled",
  estimatejobcancelled: "cancelled",
  cancelled: "cancelled",
  trash: "trash",
};

export function stageKeyFor(name: string): StageKey | null {
  return KEY_BY_NAME[normalizeStageName(name)] ?? null;
}

// The board only switches on for a pipeline carrying these. Willis's and Made
// Better's older Sales pipelines lack Lead/Follow Up/Job Booked, so they keep
// the old Leads page until they are moved over by hand.
const CORE: StageKey[] = ["lead", "estimate", "job", "won", "followUp", "lost"];

interface RawPipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string; position?: number; color?: string }[];
}

export function resolveBoardPipeline(pipelines: RawPipeline[]): BoardPipeline | null {
  for (const p of pipelines) {
    const stages: BoardStage[] = [...(p.stages ?? [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, key: stageKeyFor(s.name) }));
    const keys = new Set(stages.map((s) => s.key));
    if (CORE.every((k) => keys.has(k))) return { pipelineId: p.id, stages };
  }
  return null;
}

// The stage a lead tracker row mirrors: the GHL stage name as the client reads
// it in GHL, plus the board key that picks its colour (null for a stage the
// board does not name, which still shows by name).
export interface TrackerStage {
  name: string;
  key: StageKey | null;
}

// Each contact's current stage on the board pipeline. A contact with two cards
// there (an old won job, a fresh enquiry) reads as the newest card, since that
// is the deal the owner is working now.
export function stageByContact(
  pipeline: BoardPipeline,
  opps: { contactId: string; pipelineId: string; pipelineStageId: string; createdAt: string }[],
): Map<string, TrackerStage> {
  const stageById = new Map(pipeline.stages.map((s) => [s.id, s]));
  const newest = new Map<string, { createdAt: string; stage: TrackerStage }>();
  for (const o of opps) {
    if (!o.contactId || o.pipelineId !== pipeline.pipelineId) continue;
    const s = stageById.get(o.pipelineStageId);
    if (!s) continue;
    const held = newest.get(o.contactId);
    if (held && held.createdAt >= o.createdAt) continue;
    newest.set(o.contactId, { createdAt: o.createdAt, stage: { name: s.name, key: s.key } });
  }
  return new Map([...newest].map(([id, v]) => [id, v.stage]));
}

export interface MoveInput {
  stageId: string;
  at?: string;
  note?: string;
  value?: number;
  lostReason?: LostReason;
}

export type MovePlan =
  | {
      ok: true;
      key: StageKey | null;
      ghl: { pipelineStageId: string; status: "open" | "won" | "lost"; monetaryValue?: number };
      booking?: { kind: BookingKind; startsAt: string };
      // Scheduled bookings of these kinds become 'done'.
      closeBookings: BookingKind[];
      followUp?: { dueAt: string; note: string };
      closeFollowUp: boolean;
      lostReason?: LostReason;
      wonValue?: number;
    }
  | { ok: false; error: "unknown_stage" | "at_required" | "value_required" | "reason_required" };

function isoOrNull(at: string | undefined): string | null {
  if (typeof at !== "string" || !at.trim()) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function planMove(stages: BoardStage[], input: MoveInput): MovePlan {
  const stage = stages.find((s) => s.id === input.stageId);
  if (!stage) return { ok: false, error: "unknown_stage" };
  const key = stage.key;
  const base = {
    ok: true as const,
    key,
    ghl: { pipelineStageId: stage.id, status: "open" as "open" | "won" | "lost" },
    closeBookings: [] as BookingKind[],
    closeFollowUp: key !== "followUp",
  };

  switch (key) {
    case "followUp": {
      const dueAt = isoOrNull(input.at);
      if (!dueAt) return { ok: false, error: "at_required" };
      return { ...base, followUp: { dueAt, note: (input.note ?? "").trim() } };
    }
    case "estimate": {
      const startsAt = isoOrNull(input.at);
      if (!startsAt) return { ok: false, error: "at_required" };
      return { ...base, booking: { kind: "estimate", startsAt } };
    }
    case "job": {
      const startsAt = isoOrNull(input.at);
      if (!startsAt) return { ok: false, error: "at_required" };
      return { ...base, booking: { kind: "job", startsAt }, closeBookings: ["estimate"] };
    }
    case "won": {
      const v = input.value;
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return { ok: false, error: "value_required" };
      return {
        ...base,
        ghl: { pipelineStageId: stage.id, status: "won", monetaryValue: v },
        closeBookings: ["estimate", "job"],
        wonValue: v,
      };
    }
    case "lost": {
      if (!input.lostReason || !LOST_REASONS.includes(input.lostReason)) {
        return { ok: false, error: "reason_required" };
      }
      return { ...base, ghl: { pipelineStageId: stage.id, status: "lost" }, lostReason: input.lostReason };
    }
    // Lead, Long Term Nurture, Cancelled, Trash and any stage the board does not
    // name: a plain move. Cancelled deliberately leaves bookings alone (Jake).
    default:
      return base;
  }
}
