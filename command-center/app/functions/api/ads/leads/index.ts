import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type ApiLead,
  type GhlContext,
} from "../../../lib/ghl";

// GET /api/ads/leads: every opportunity in the Paid Ad's Pipeline, shaped as an
// ApiLead (plus the verbatim GHL stage name so the client can map it to its own
// friendly stage buckets), newest activity first.
//
// The pipeline is resolved BY NAME per tenant (ids differ per client), exact
// match first then a looser contains, mirroring functions/api/reviews. The
// hardcoded id is only a last-resort fallback for the known Willis template.

const PAID_PIPELINE_NAME = "paid ad's pipeline";
const PAID_PIPELINE_CONTAINS = "paid ad";
const PAID_PIPELINE_FALLBACK_ID = "uz0fFxCgiwdXbg4Zmwkc";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

// The list rows the Paid Ads surface reads. ApiLead plus the resolved stage name
// (the id alone is opaque to the client, which maps names to its stage keys).
export interface ApiAdLead extends ApiLead {
  stageName: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Find the Paid Ad's Pipeline by name, then fall back to the known template id.
// Returns the pipeline id plus a stageId -> stageName map, or null if neither
// the name nor the fallback id is present for this tenant.
function resolvePipeline(
  pipes: PipelinesResponse["pipelines"],
): { pipelineId: string; stageNames: Map<string, string> } | null {
  const pipe =
    pipes.find((p) => norm(p.name) === PAID_PIPELINE_NAME) ??
    pipes.find((p) => norm(p.name).includes(PAID_PIPELINE_CONTAINS)) ??
    pipes.find((p) => p.id === PAID_PIPELINE_FALLBACK_ID);
  if (!pipe) return null;
  const stageNames = new Map<string, string>();
  for (const s of pipe.stages) stageNames.set(s.id, s.name);
  return { pipelineId: pipe.id, stageNames };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const resolved = resolvePipeline(pipeData.pipelines ?? []);
  if (!resolved) {
    return Response.json({ leads: [], total: 0, configError: "pipeline_not_found" });
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: resolved.pipelineId });

  const leads: ApiAdLead[] = opps.map((o) => ({
    ...shapeOpportunity(o),
    stageName: resolved.stageNames.get(o.pipelineStageId ?? "") ?? "",
  }));
  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ leads, total: leads.length });
};
