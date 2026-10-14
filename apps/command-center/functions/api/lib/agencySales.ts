import type { GhlContext } from "../../lib/ghl";
import { ghlJson } from "../../lib/ghl";
import {
  missingStages,
  pickSalesPipeline,
  SALES_PIPELINE_NAME,
  type NamedStage,
} from "../../lib/salesPipeline";

// Finding the agency's own Sales board, and checking it still has the stages the
// console's buttons expect.
//
// READ ONLY. This file used to move cards (routeSalesCall, Stage 2 of
// docs/build-plans/agency-ghl-connection.md); see the note at the foot of the
// file for where that went and why. Nothing here writes to GoHighLevel.

export interface AgencySalesPipeline {
  id: string;
  name: string;
  stages: NamedStage[];
  // Stages the console can say that this board has no column for. Empty on a
  // healthy board; non-empty is worth showing rather than discovering per press.
  missing: string[];
}

interface RawPipeline {
  id?: string;
  name?: string;
  stages?: { id?: string; name?: string }[];
}

// The Sales Pipeline, found by name on the agency account.
//
// Read live every time rather than cached. These boards are Jake's, they get
// renamed and reordered, and a stale stage id is a card dropped in the wrong
// column with nothing to indicate it happened.
export async function resolveAgencySalesPipeline(
  gctx: GhlContext,
): Promise<AgencySalesPipeline | null> {
  const data = await ghlJson<{ pipelines?: RawPipeline[] }>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const pipelines = data.pipelines ?? [];

  // Which board is the Sales board lives in salesPipeline.ts, so this resolver
  // and the read-only board page can never pick different ones.
  const match = pickSalesPipeline(pipelines);
  if (!match?.id) return null;

  const stages: NamedStage[] = (match.stages ?? [])
    .filter((s): s is { id: string; name: string } => Boolean(s.id && s.name))
    .map((s) => ({ id: s.id, name: s.name }));

  return {
    id: match.id,
    name: match.name ?? SALES_PIPELINE_NAME,
    stages,
    missing: missingStages(stages),
  };
}

// routeSalesCall lived here: it PUT a stage and a won/lost status onto the
// card for every outcome. It was removed in docs/build-plans/sales-call-tags.md,
// when the app stopped authoring the board. What replaced it is one tag on the
// contact (functions/lib/salesCallTags.ts) plus, on a close only, the cash
// figure written to whatever card Jake's workflow made
// (functions/api/lib/salesCallPush.ts).
//
// What is left here is the READ half, which both the Sales Pipeline page and
// the Sales Calls page still need: which board is the Sales board, and which of
// the stages the buttons expect it is missing.
