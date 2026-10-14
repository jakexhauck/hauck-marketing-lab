import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type ApiLead,
  type GhlContext,
} from "./ghl";

// Paid Ads "Data & Leads" pipeline resolution + fetch, shared by the client
// endpoint (functions/api/ads/leads/index.ts) and, in a later phase, the admin
// Fulfillment cockpit's per-tenant view. Ports the exact by-name pipeline
// resolution and opportunity shaping that used to live inline in
// ads/leads/index.ts so both callers share one implementation.
//
// The pipeline is resolved BY NAME per tenant (ids differ per client), exact
// match first then a looser contains, mirroring functions/api/reviews. The
// hardcoded id is only a last-resort fallback for the known Willis template.

export const PAID_PIPELINE_NAME = "paid ad's pipeline";
export const PAID_PIPELINE_CONTAINS = "paid ad";
export const PAID_PIPELINE_FALLBACK_ID = "uz0fFxCgiwdXbg4Zmwkc";

export interface PipelinesResponse {
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
export function resolvePaidAdsPipeline(
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

// The full Paid Ads leads list for one tenant: resolve the pipeline by name,
// then fetch every opportunity in it, shaped + sorted newest-activity-first.
// configError: "pipeline_not_found" when this tenant has no Paid Ad's Pipeline
// (honest empty, never a fabricated lead).
export async function fetchPaidAdsLeads(
  gctx: GhlContext,
): Promise<{ leads: ApiAdLead[]; total: number; configError?: "pipeline_not_found" }> {
  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const resolved = resolvePaidAdsPipeline(pipeData.pipelines ?? []);
  if (!resolved) {
    return { leads: [], total: 0, configError: "pipeline_not_found" };
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: resolved.pipelineId });

  const leads: ApiAdLead[] = opps.map((o) => ({
    ...shapeOpportunity(o),
    stageName: resolved.stageNames.get(o.pipelineStageId ?? "") ?? "",
  }));
  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return { leads, total: leads.length };
}
