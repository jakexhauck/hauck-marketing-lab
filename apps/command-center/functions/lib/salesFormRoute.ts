import type { DispositionStatus } from "./salesDisposition";
import { findStage, normalizeStageName, pickSalesPipeline } from "./salesPipeline";

// Where the post-call form puts the lead in the Hauck sub-account (Jake,
// 2026-10-13). Each answer has a column of the same name on the Sales board,
// except PIF and Deposit: a close leaves Sales and its card moves to the
// Onboarding board's PIF or Deposit column.
//
// Matched by NAME, the house rule (salesPipeline.ts): the live columns carry
// emoji ("💰 PIF") that normalizeStageName strips, and "Cancelled" finds
// "Cancelled (needs reschedule)" by prefix.
//
// Pure. The GHL calls live in salesFormRouteGhl.ts.

const SALES_STAGE: Partial<Record<DispositionStatus, string>> = {
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

export interface FormRouteOk {
  ok: true;
  // Where the card goes.
  target: { pipelineId: string; stageId: string };
  close: boolean;
  salesPipelineId: string;
  // The Onboarding columns a close lands in. A card in one of these may be
  // moved by a corrected form; a card anywhere else on Onboarding has moved on.
  // Null when the account has no Onboarding board and this is not a close.
  onboarding: { pipelineId: string; closeStageIds: string[] } | null;
}

export type FormRoute = FormRouteOk | { ok: false; error: string };

export function resolveFormRoute(status: DispositionStatus, pipelines: readonly Pipeline[]): FormRoute {
  const sales = pickSalesPipeline(pipelines);
  if (!sales) return { ok: false, error: "No Sales pipeline" };

  const onbPipeline = pipelines.find((p) => normalizeStageName(p.name) === "onboarding") ?? null;
  const closeStages = onbPipeline
    ? Object.values(ONBOARDING_STAGE).map((n) => findStage(onbPipeline.stages, n!))
    : [];
  const onboarding =
    onbPipeline && closeStages.every(Boolean)
      ? { pipelineId: onbPipeline.id, closeStageIds: closeStages.map((s) => s!.id) }
      : null;

  const onbName = ONBOARDING_STAGE[status];
  if (onbName) {
    if (!onbPipeline) return { ok: false, error: "No Onboarding pipeline" };
    const stage = findStage(onbPipeline.stages, onbName);
    if (!stage || !onboarding) return { ok: false, error: `Onboarding pipeline has no ${onbName} stage` };
    return {
      ok: true,
      target: { pipelineId: onbPipeline.id, stageId: stage.id },
      close: true,
      salesPipelineId: sales.id,
      onboarding,
    };
  }

  const salesName = SALES_STAGE[status]!;
  const stage = findStage(sales.stages, salesName);
  if (!stage) return { ok: false, error: `Sales pipeline has no ${salesName} stage` };
  return {
    ok: true,
    target: { pipelineId: sales.id, stageId: stage.id },
    close: false,
    salesPipelineId: sales.id,
    onboarding,
  };
}

export interface Card {
  id: string;
  stageId: string;
}

export type CardMove =
  | { kind: "create" }
  | { kind: "move"; opportunityId: string }
  | { kind: "none"; opportunityId: string };

// Which card to move, given the contact's cards on each board.
//
// The form is an editor, so a corrected answer has to undo the last one: a
// close moves the Sales card to Onboarding, and changing it back to Follow Up
// brings that card home again. Only a card still at PIF or Deposit is ever
// taken off Onboarding; a client Being Setup is left where they are.
export function planCardMove(
  route: FormRouteOk,
  salesCards: readonly Card[],
  onboardingCards: readonly Card[],
  preferredId: string | null,
): CardMove {
  const { stageId } = route.target;
  const closeIds = route.onboarding?.closeStageIds ?? [];
  const pick = (cards: readonly Card[]) => cards.find((c) => c.id === preferredId) ?? cards[0];
  const moveTo = (c: Card): CardMove =>
    c.stageId === stageId ? { kind: "none", opportunityId: c.id } : { kind: "move", opportunityId: c.id };

  if (route.close) {
    if (onboardingCards.length > 0) {
      const there = onboardingCards.find((c) => c.stageId === stageId);
      if (there) return { kind: "none", opportunityId: there.id };
      const atClose = onboardingCards.find((c) => closeIds.includes(c.stageId));
      return atClose ? moveTo(atClose) : { kind: "none", opportunityId: onboardingCards[0].id };
    }
    return salesCards.length > 0 ? moveTo(pick(salesCards)!) : { kind: "create" };
  }

  if (salesCards.length > 0) return moveTo(pick(salesCards)!);
  const atClose = onboardingCards.filter((c) => closeIds.includes(c.stageId));
  return atClose.length > 0 ? moveTo(pick(atClose)!) : { kind: "create" };
}
