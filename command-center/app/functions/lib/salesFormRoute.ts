import type { DispositionStatus } from "./salesDisposition";
import { findStage, normalizeStageName, pickSalesPipeline } from "./salesPipeline";

// Where the post-call form puts the lead in the Hauck sub-account (Jake,
// 2026-10-13). Each answer has a column of the same name on the Sales board;
// a PIF or Deposit also starts them on the Onboarding board.
//
// Matched by NAME, the house rule (salesPipeline.ts): the live columns carry
// emoji ("💰 PIF") that normalizeStageName strips, and "Cancelled" finds
// "Cancelled (needs reschedule)" by prefix.
//
// Pure. The GHL calls live in salesFormRouteGhl.ts.

const SALES_STAGE: Record<DispositionStatus, string> = {
  pif: "PIF",
  deposit: "Deposit",
  noclose: "No-Close",
  noshow: "No-Show",
  followup: "Follow Up",
  unqualified: "Unqualified",
  cancelled: "Cancelled",
};

const ONBOARDING_STAGE: Partial<Record<DispositionStatus, string>> = {
  pif: "PIF",
  deposit: "Deposit",
};

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export interface SalesTarget {
  pipelineId: string;
  stageId: string;
}

export interface OnboardingTarget extends SalesTarget {
  // The Onboarding columns a close can land in. A card in one of these may be
  // switched by a corrected form; a card anywhere else has moved on.
  closeStageIds: string[];
}

export type FormRoute =
  | { ok: true; sales: SalesTarget; onboarding: OnboardingTarget | null }
  | { ok: false; error: string };

export function resolveFormRoute(status: DispositionStatus, pipelines: readonly Pipeline[]): FormRoute {
  const sales = pickSalesPipeline(pipelines);
  if (!sales) return { ok: false, error: "No Sales pipeline" };
  const salesStage = findStage(sales.stages, SALES_STAGE[status]);
  if (!salesStage) return { ok: false, error: `Sales pipeline has no ${SALES_STAGE[status]} stage` };

  const onbName = ONBOARDING_STAGE[status];
  if (!onbName) {
    return { ok: true, sales: { pipelineId: sales.id, stageId: salesStage.id }, onboarding: null };
  }
  const onb = pipelines.find((p) => normalizeStageName(p.name) === "onboarding");
  if (!onb) return { ok: false, error: "No Onboarding pipeline" };
  const closeStages = Object.values(ONBOARDING_STAGE).map((n) => findStage(onb.stages, n!));
  const onbStage = findStage(onb.stages, onbName);
  if (!onbStage || closeStages.some((s) => !s)) {
    return { ok: false, error: `Onboarding pipeline has no ${onbName} stage` };
  }
  return {
    ok: true,
    sales: { pipelineId: sales.id, stageId: salesStage.id },
    onboarding: {
      pipelineId: onb.id,
      stageId: onbStage.id,
      closeStageIds: closeStages.map((s) => s!.id),
    },
  };
}

export type OnboardingMove =
  | { kind: "create" }
  | { kind: "move"; opportunityId: string }
  | { kind: "none" };

// What to do with the contact's Onboarding cards. Re-saving the form must never
// drag a client who is Being Setup or Active back to PIF.
export function onboardingMove(
  target: OnboardingTarget,
  existing: readonly { id: string; stageId: string }[],
): OnboardingMove {
  if (existing.length === 0) return { kind: "create" };
  if (existing.some((o) => o.stageId === target.stageId)) return { kind: "none" };
  const atClose = existing.find((o) => target.closeStageIds.includes(o.stageId));
  return atClose ? { kind: "move", opportunityId: atClose.id } : { kind: "none" };
}
