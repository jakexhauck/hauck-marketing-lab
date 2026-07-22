import type { Env, ApiData } from "../../../lib/env";
import { ghlJson, fetchAllOpportunities, type GhlContext } from "../../../lib/ghl";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveJobCompletedStage, type PipelineLike } from "../../../lib/closeOutQueue";

// GET /api/sales/close-outs/count: what still needs closing out.
//
// The one rule, and the reason it is a join rather than a stage count:
//
//   a job needs close-out when its opportunity is in "Job Completed" AND its id
//   is absent from customer_jobs.source_opportunity_id
//
// A first-timer's opportunity MOVES out of Job Completed when it is closed out,
// so a bare stage count would be right for them. A repeat customer's incoming
// opportunity is PARKED in Job Completed forever (see functions/lib/closeOut.ts),
// so a bare stage count would nag about it for eternity. The ledger join is
// correct for both.
//
// Feeds all three nudges: the red badge on the board card, the sidebar count and
// the Home banner.

interface PipelinesResponse {
  pipelines: PipelineLike[];
}

export interface CloseOutCountResponse {
  count: number;
  opportunityIds: string[];
  // We could not read the ledger, so we cannot tell closed-out jobs from open
  // ones. Report nothing rather than nag about every completed job the client
  // has ever had.
  unavailable?: boolean;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const target = resolveJobCompletedStage(pipeData.pipelines ?? []);
  if (!target) {
    return Response.json({ count: 0, opportunityIds: [] } satisfies CloseOutCountResponse);
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: target.pipelineId });
  const inStage = opps.filter((o) => o.pipelineStageId === target.stageId);
  if (inStage.length === 0) {
    return Response.json({ count: 0, opportunityIds: [] } satisfies CloseOutCountResponse);
  }

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, t.slug) : null;
  if (!client || !tenantId) {
    return Response.json({
      count: 0,
      opportunityIds: [],
      unavailable: true,
    } satisfies CloseOutCountResponse);
  }

  const ids = inStage.map((o) => o.id);
  const { data, error } = await client
    .from("customer_jobs")
    .select("source_opportunity_id")
    .eq("tenant_id", tenantId)
    .in("source_opportunity_id", ids);

  if (error) {
    console.warn("[close-outs.count] ledger read failed", error);
    return Response.json({
      count: 0,
      opportunityIds: [],
      unavailable: true,
    } satisfies CloseOutCountResponse);
  }

  const closed = new Set(
    (data as { source_opportunity_id: string | null }[])
      .map((r) => r.source_opportunity_id)
      .filter((v): v is string => Boolean(v)),
  );
  const pending = ids.filter((id) => !closed.has(id));

  return Response.json({
    count: pending.length,
    opportunityIds: pending,
  } satisfies CloseOutCountResponse);
};
