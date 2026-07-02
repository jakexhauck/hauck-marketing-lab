import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type ApiLead,
  type GhlContext,
  type GhlOpportunity,
} from "../../../lib/ghl";

// GET /api/sales/leads: the merged "Leads" feed. Every opportunity in the Paid
// Ad's Pipeline plus the Organic Pipeline, each tagged with a channel `source`
// ("ad" | "form" | "chat") and a friendly `status` derived from its real GHL
// stage, newest activity first.
//
// Both pipelines are resolved BY NAME per tenant (ids differ per client), exact
// match first then contains, mirroring functions/api/reviews. Hardcoded ids are
// only last-resort fallbacks for the known Willis template.

const PAID_NAME = "paid ad's pipeline";
const PAID_CONTAINS = "paid ad";
const PAID_FALLBACK_ID = "uz0fFxCgiwdXbg4Zmwkc";

const ORGANIC_NAME = "organic pipeline";
const ORGANIC_CONTAINS = "organic";
const ORGANIC_FALLBACK_ID = "NSkPBlP8BcPTtyibNEIu";

export type LeadSource = "ad" | "form" | "chat";
export type LeadStatus = "new" | "working" | "booked" | "won" | "cold";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

// The merged list rows the unified Leads surface reads.
export interface ApiSalesLead extends ApiLead {
  source: LeadSource;
  status: LeadStatus;
  stageName: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Normalise a stage name for the status map: lower-case, collapse whitespace,
// and tighten spacing around slashes so "Apt Completed / Quote Given" and
// "Apt Completed/ Quote Given" both key the same.
function normStage(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

// Real GHL stage name -> friendly status. Covers both the Paid Ad's and Organic
// pipelines; shared names ("Lead In", "No Answer", ...) map consistently.
const STAGE_STATUS: Record<string, LeadStatus> = {
  "lead in": "new",
  "lead in no appointment booked": "new",
  "lead responded": "working",
  "no answer": "working",
  "not qualified": "cold",
  "intro call waiting confirmation": "booked",
  "intro call no confirmation": "cold",
  "estimate scheduled": "booked",
  "apt completed/quote given": "working",
  "followup - not ready": "cold",
  "estimate completed/quote given": "working",
  "follow up - not ready": "cold",
  "no show": "cold",
};

function statusForStage(stageName: string): LeadStatus {
  return STAGE_STATUS[normStage(stageName)] ?? "working";
}

// Organic leads split into "form" vs "chat" by their source string; a source
// containing "chat" is the website chat widget, everything else is a form.
function organicSource(o: GhlOpportunity): LeadSource {
  return norm(o.source ?? "").includes("chat") ? "chat" : "form";
}

function resolve(
  pipes: PipelinesResponse["pipelines"],
  exact: string,
  contains: string,
  fallbackId: string,
): { pipelineId: string; stageNames: Map<string, string> } | null {
  const pipe =
    pipes.find((p) => norm(p.name) === exact) ??
    pipes.find((p) => norm(p.name).includes(contains)) ??
    pipes.find((p) => p.id === fallbackId);
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
  const pipes = pipeData.pipelines ?? [];
  const paid = resolve(pipes, PAID_NAME, PAID_CONTAINS, PAID_FALLBACK_ID);
  const organic = resolve(pipes, ORGANIC_NAME, ORGANIC_CONTAINS, ORGANIC_FALLBACK_ID);

  const leads: ApiSalesLead[] = [];

  if (paid) {
    const opps = await fetchAllOpportunities(gctx, { pipelineId: paid.pipelineId });
    for (const o of opps) {
      const stageName = paid.stageNames.get(o.pipelineStageId ?? "") ?? "";
      leads.push({
        ...shapeOpportunity(o),
        source: "ad",
        status: statusForStage(stageName),
        stageName,
      });
    }
  }

  if (organic) {
    const opps = await fetchAllOpportunities(gctx, { pipelineId: organic.pipelineId });
    for (const o of opps) {
      const stageName = organic.stageNames.get(o.pipelineStageId ?? "") ?? "";
      leads.push({
        ...shapeOpportunity(o),
        source: organicSource(o),
        status: statusForStage(stageName),
        stageName,
      });
    }
  }

  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({
    leads,
    total: leads.length,
    configError: !paid && !organic ? "pipeline_not_found" : undefined,
  });
};
