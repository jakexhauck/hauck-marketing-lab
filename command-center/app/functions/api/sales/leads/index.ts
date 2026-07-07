import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  shapeOpportunity,
  type ApiLead,
  type GhlContext,
} from "../../../lib/ghl";
import { readJsonBody } from "../../../lib/body";
import { resolveStageByName, createOpportunity } from "../../lib/writes";
import { classifySource, type LeadSource } from "./source";

// GET /api/sales/leads: the unified "Leads" feed. Every opportunity in the
// consolidated Sales pipeline, each tagged with a channel `source`
// ("ad" | "form" | "chat") via the Task 6 classifier and a friendly `status`
// derived from its real GHL stage, newest activity first.
//
// The pipeline is resolved BY NAME per tenant (ids differ per client), exact
// match first then contains, mirroring functions/api/reviews. A hardcoded id
// is only a last-resort fallback for the known Willis template.

const SALES_NAME = "sales";
const SALES_CONTAINS = "sales";
const SALES_FALLBACK_ID = "6o9Gx6e0TXRFJdln5d01";

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

// Real GHL stage name -> friendly status, covering every stage of the
// consolidated Sales pipeline.
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
  "missed call - contact": "new",
  "intro call confirmed": "booked",
  "job booked": "booked",
  "job completed": "won",
  "estimate completed": "working",
  "follow up": "working",
  "no-close": "cold",
  "abandoned": "cold",
};

function statusForStage(stageName: string): LeadStatus {
  return STAGE_STATUS[normStage(stageName)] ?? "working";
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
  const sales = resolve(pipes, SALES_NAME, SALES_CONTAINS, SALES_FALLBACK_ID);

  const leads: ApiSalesLead[] = [];
  if (sales) {
    const opps = await fetchAllOpportunities(gctx, { pipelineId: sales.pipelineId });
    for (const o of opps) {
      const stageName = sales.stageNames.get(o.pipelineStageId ?? "") ?? "";
      leads.push({
        ...shapeOpportunity(o),
        source: classifySource(o.source),
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
    configError: !sales ? "pipeline_not_found" : undefined,
  });
};

interface CreateLeadBody {
  contactId: string;
  pipelineName: string;
  stageName: string;
  name: string;
  monetaryValue?: number;
  status?: "open" | "won" | "lost" | "abandoned";
}

// POST /api/sales/leads: create a new opportunity for an existing contact,
// used when a terminal call outcome lands on an unknown inbound caller who has
// no opportunity yet. Pipeline + stage resolve BY NAME per tenant, same as the
// off-ramp write in [id]/stage.ts.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const body = await readJsonBody<CreateLeadBody>(ctx.request);
  if (!body?.contactId || !body.pipelineName || !body.stageName) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }
  const { pipelineId, stageId } = await resolveStageByName(
    gctx,
    body.pipelineName,
    body.stageName,
  );
  if (!pipelineId || !stageId) {
    return Response.json({ error: "stage_not_found" }, { status: 404 });
  }
  const result = await createOpportunity(gctx, {
    pipelineId,
    pipelineStageId: stageId,
    contactId: body.contactId,
    name: body.name || "Inbound call",
    monetaryValue: body.monetaryValue,
    status: body.status,
  });
  if (!result.ok) {
    return Response.json(
      { error: "ghl_error", status: result.status, body: result.body },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, id: result.id });
};
