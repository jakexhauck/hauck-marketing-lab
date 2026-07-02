import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type ApiLead,
  type GhlContext,
  type GhlOpportunity,
} from "../../../lib/ghl";

// GET /api/forms/submissions: inbound leads in the Organic Pipeline, shaped as
// ApiLeads (plus the verbatim stage name + source), newest activity first.
//
// ?source=website-form  -> only opps whose source contains "website form"
// ?source=chat-widget   -> only opps whose source contains "chat"
// (no source param)      -> every Organic opp
//
// Estimate Forms and Chat Widget are the same surface over the same pipeline;
// only the source split differs. The pipeline is resolved BY NAME per tenant
// (ids differ per client), exact match first then contains, mirroring
// functions/api/reviews. The hardcoded id is only a last-resort fallback.

const ORGANIC_PIPELINE_NAME = "organic pipeline";
const ORGANIC_PIPELINE_CONTAINS = "organic";
const ORGANIC_PIPELINE_FALLBACK_ID = "NSkPBlP8BcPTtyibNEIu";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

// The list rows the Estimate Forms / Chat Widget surfaces read: ApiLead plus the
// resolved stage name and the raw GHL source string.
export interface ApiFormSubmission extends ApiLead {
  stageName: string;
  source: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function resolvePipeline(
  pipes: PipelinesResponse["pipelines"],
): { pipelineId: string; stageNames: Map<string, string> } | null {
  const pipe =
    pipes.find((p) => norm(p.name) === ORGANIC_PIPELINE_NAME) ??
    pipes.find((p) => norm(p.name).includes(ORGANIC_PIPELINE_CONTAINS)) ??
    pipes.find((p) => p.id === ORGANIC_PIPELINE_FALLBACK_ID);
  if (!pipe) return null;
  const stageNames = new Map<string, string>();
  for (const s of pipe.stages) stageNames.set(s.id, s.name);
  return { pipelineId: pipe.id, stageNames };
}

// The lead's source string, from the opportunity or its joined contact record.
function sourceOf(o: GhlOpportunity): string {
  return o.source ?? "";
}

// Keep only opps matching the requested source. "website-form" matches a source
// containing "website form" (or a bare "form"); "chat-widget" matches "chat".
function sourceMatches(o: GhlOpportunity, source: string): boolean {
  const src = norm(sourceOf(o));
  if (source === "website-form") {
    return src.includes("website form") || src.includes("form");
  }
  if (source === "chat-widget") {
    return src.includes("chat");
  }
  return true;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const url = new URL(ctx.request.url);
  const source = url.searchParams.get("source") ?? "";

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const resolved = resolvePipeline(pipeData.pipelines ?? []);
  if (!resolved) {
    return Response.json({
      submissions: [],
      total: 0,
      configError: "pipeline_not_found",
    });
  }

  const opps = await fetchAllOpportunities(gctx, {
    pipelineId: resolved.pipelineId,
  });

  const submissions: ApiFormSubmission[] = opps
    .filter((o) => (source ? sourceMatches(o, source) : true))
    .map((o) => ({
      ...shapeOpportunity(o),
      stageName: resolved.stageNames.get(o.pipelineStageId ?? "") ?? "",
      source: sourceOf(o),
    }));
  submissions.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ submissions, total: submissions.length });
};
