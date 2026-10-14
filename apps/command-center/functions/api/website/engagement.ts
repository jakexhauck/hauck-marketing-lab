import type { Env, ApiData } from "../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
  type GhlOpportunity,
} from "../../lib/ghl";

// Website > Insights engagement numbers: how many estimate-form submissions and
// chat-widget conversations the client's site produced this month vs last. These
// are read-only counts from the client's inbound lead pipeline (the same Organic
// pipeline the Estimate Forms / Chat Widget lead surfaces read), split by the
// lead's source. The pipeline is resolved BY NAME per tenant (ids differ per
// client), exact match first then contains, mirroring functions/api/forms.
//
// Golden rule (same as analytics): a real client only ever sees their own real
// numbers. Missing token, missing pipeline, or any GHL error returns
// { connected: false } and the Insights tab keeps its honest zeros. The client
// UI never names the source system. No automations: this is reporting only.
//
// GET /api/website/engagement

export interface EngagementMetric {
  thisMonth: number;
  lastMonth: number;
  // Percent change vs last month; null when last month was zero.
  deltaPct: number | null;
}
export interface WebsiteEngagement {
  connected: boolean;
  estimateForm: EngagementMetric;
  chatWidget: EngagementMetric;
}

const EMPTY_METRIC: EngagementMetric = { thisMonth: 0, lastMonth: 0, deltaPct: null };
const NOT_CONNECTED: WebsiteEngagement = {
  connected: false,
  estimateForm: EMPTY_METRIC,
  chatWidget: EMPTY_METRIC,
};

const ORGANIC_PIPELINE_NAME = "organic pipeline";
const ORGANIC_PIPELINE_CONTAINS = "organic";
const ORGANIC_PIPELINE_FALLBACK_ID = "NSkPBlP8BcPTtyibNEIu";

interface PipelinesResponse {
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function resolvePipelineId(pipes: PipelinesResponse["pipelines"]): string | null {
  const pipe =
    pipes.find((p) => norm(p.name) === ORGANIC_PIPELINE_NAME) ??
    pipes.find((p) => norm(p.name).includes(ORGANIC_PIPELINE_CONTAINS)) ??
    pipes.find((p) => p.id === ORGANIC_PIPELINE_FALLBACK_ID);
  return pipe?.id ?? null;
}

// Source classifiers, matching functions/api/forms/submissions: an estimate-form
// lead's source contains "form"; a chat-widget lead's source contains "chat".
function isEstimateForm(o: GhlOpportunity): boolean {
  const s = norm(o.source ?? "");
  return s.includes("website form") || s.includes("form");
}
function isChatWidget(o: GhlOpportunity): boolean {
  return norm(o.source ?? "").includes("chat");
}

// UTC start-of-month for this month and last month.
function monthBounds(now: Date): { thisStart: number; lastStart: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { thisStart: Date.UTC(y, m, 1), lastStart: Date.UTC(y, m - 1, 1) };
}

export function computeMetric(
  opps: GhlOpportunity[],
  matches: (o: GhlOpportunity) => boolean,
  thisStart: number,
  lastStart: number,
): EngagementMetric {
  let thisMonth = 0;
  let lastMonth = 0;
  for (const o of opps) {
    if (!matches(o)) continue;
    const t = o.createdAt ? +new Date(o.createdAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (t >= thisStart) thisMonth += 1;
    else if (t >= lastStart) lastMonth += 1;
  }
  const deltaPct =
    lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  return { thisMonth, lastMonth, deltaPct };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t.ghl_token || !t.ghl_location_id) return Response.json(NOT_CONNECTED);
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  let pipelineId: string | null;
  try {
    const pipeData = await ghlJson<PipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
    );
    pipelineId = resolvePipelineId(pipeData.pipelines ?? []);
  } catch {
    return Response.json(NOT_CONNECTED);
  }
  if (!pipelineId) return Response.json(NOT_CONNECTED);

  let opps: GhlOpportunity[];
  try {
    opps = await fetchAllOpportunities(gctx, { pipelineId });
  } catch {
    return Response.json(NOT_CONNECTED);
  }

  const { thisStart, lastStart } = monthBounds(new Date());
  const body: WebsiteEngagement = {
    connected: true,
    estimateForm: computeMetric(opps, isEstimateForm, thisStart, lastStart),
    chatWidget: computeMetric(opps, isChatWidget, thisStart, lastStart),
  };
  return Response.json(body);
};
