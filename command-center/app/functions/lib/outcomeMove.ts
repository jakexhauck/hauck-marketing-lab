import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlJson, type GhlContext } from "./ghl";
import { createOpportunity, putOpportunity } from "../api/lib/writes";
import { planMove, type MoveInput, type StageKey } from "./leadBoard";
import { copyBookingToContact, loadBoardPipeline } from "./leadBoardGhl";
import { applyPlanWrites, bumpAttempts } from "./leadBoardStore";
import { moveContactStage } from "./estimateOutcomeGhl";

// Move a lead from an owner link (lib/outcome.ts) exactly the way the Leads
// board moves a card: the same plan, the same GHL write, the same app rows
// (bookings, follow-up, lost reason, attempts). So a tap on a text link and a
// drag on the board can never leave the lead in two different places.
//
// The lead is found by contact: its card on the board pipeline (newest wins).
// A contact with no card there gets one, in the target stage, so a lead never
// fails to move just because it was never put on the board.
//
// A client still on the older pipelines (no board pipeline) falls back to the
// by-name stage move the owner links always used.

export type MoveResult =
  | { moved: true; opportunityId: string | null; stageName: string }
  | { moved: false; why: string };

// The older pipelines' stage names for the fallback.
const FALLBACK_STAGE: Partial<Record<StageKey, string>> = {
  estimate: "Estimate Booked",
  job: "Job Booked",
  followUp: "Follow Up",
  noAnswer: "Follow Up",
  lost: "Lost",
};

interface SearchOpp {
  id: string;
  pipelineId: string;
  createdAt?: string;
}

export async function moveLeadByContact(opts: {
  client: SupabaseClient;
  gctx: GhlContext;
  tenantId: string;
  contactId: string;
  contactName: string;
  zone: string;
  key: StageKey;
  input: Omit<MoveInput, "stageId">;
  // Opportunity value to set, in dollars (Job closed).
  monetaryValue?: number;
  by: string;
}): Promise<MoveResult> {
  const { client, gctx, contactId } = opts;
  try {
    const board = await loadBoardPipeline(gctx);
    if (!board) {
      const name = FALLBACK_STAGE[opts.key];
      if (!name) return { moved: false, why: "no stage" };
      const r = await moveContactStage(gctx, contactId, name, {
        status: opts.key === "lost" ? "lost" : undefined,
        monetaryValue: opts.monetaryValue,
      });
      return r === "moved" ? { moved: true, opportunityId: null, stageName: name } : { moved: false, why: r };
    }

    // No Answer until the client's pipeline has that stage: Follow Up.
    const stage =
      board.stages.find((s) => s.key === opts.key) ??
      (opts.key === "noAnswer" ? board.stages.find((s) => s.key === "followUp") : undefined);
    if (!stage) return { moved: false, why: `no ${opts.key} stage` };

    const plan = planMove(board.stages, { ...opts.input, stageId: stage.id });
    if (!plan.ok) return { moved: false, why: plan.error };
    const ghl = opts.monetaryValue !== undefined ? { ...plan.ghl, monetaryValue: opts.monetaryValue } : plan.ghl;

    const { opportunities = [] } = await ghlJson<{ opportunities?: SearchOpp[] }>(
      gctx,
      `/opportunities/search?location_id=${encodeURIComponent(gctx.locationId)}` +
        `&contact_id=${encodeURIComponent(contactId)}&limit=100`,
    );
    const onBoard = opportunities
      .filter((o) => o.pipelineId === board.pipelineId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];

    let opportunityId: string;
    if (onBoard) {
      const res = await putOpportunity(gctx, onBoard.id, ghl);
      if (!res.ok) return { moved: false, why: `move ${res.status}` };
      opportunityId = onBoard.id;
    } else {
      const made = await createOpportunity(gctx, {
        pipelineId: board.pipelineId,
        pipelineStageId: ghl.pipelineStageId,
        contactId,
        name: opts.contactName,
        status: ghl.status,
        monetaryValue: ghl.monetaryValue,
      });
      if (!made.ok) return { moved: false, why: `create ${made.status}` };
      opportunityId = made.id;
    }

    const who = { tenantId: opts.tenantId, opportunityId, contactId, by: opts.by, zone: opts.zone };
    await applyPlanWrites(client, who, plan);
    if (opts.key === "noAnswer") await bumpAttempts(client, opts.tenantId, opportunityId);
    if (plan.booking) await copyBookingToContact(gctx, contactId, plan.booking.kind, plan.booking.startsAt, opts.zone);
    return { moved: true, opportunityId, stageName: stage.name };
  } catch (err) {
    return { moved: false, why: `move failed: ${String(err).slice(0, 120)}` };
  }
}
