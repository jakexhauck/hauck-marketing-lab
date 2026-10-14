import type { Env, ApiData } from "../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
  type GhlOpportunity,
} from "../../lib/ghl";

// The client-facing Google Reviews funnel layers over the always-on GHL review
// pipeline: contacts the review campaign asks, tracked through a link click to
// either a public positive review or private negative feedback (the review
// gate). IDs differ per tenant, so resolve the pipeline BY NAME, never hardcode.
// Same name-resolution pattern as functions/api/campaigns/reactivation.ts and
// functions/api/reviews/index.ts.
//
// Confirmed Willis stages, each tied to a GHL automation:
//   "Asked for review"           -> pending  (asked, no click yet)
//   "Review link clicked"        -> clicked
//   "Positive review submission" -> positive (the win)
//   "Negative feedback received" -> negative (gated to private feedback)

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

export type ReviewStageBucket = "pending" | "clicked" | "positive" | "negative";

export interface ReviewFunnelData {
  asked: number;
  clicked: number;
  positive: number;
  negative: number;
  pending: number;
  recent: { name: string; sub: string; initials: string }[];
  configError?: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Classify a real stage name into a funnel bucket. Order matters: the two
// outcomes (positive / negative) are checked before the generic click / ask
// stages so "Positive review submission" never falls through to "clicked" on
// the bare word "review".
export function classifyReviewStage(stageName: string): ReviewStageBucket {
  const n = norm(stageName);
  if (
    n.includes("positive") ||
    n.includes("submission") ||
    n.includes("submitted") ||
    n.includes("left a review") ||
    n.includes("google review")
  ) {
    return "positive";
  }
  if (
    n.includes("negative") ||
    n.includes("feedback") ||
    n.includes("unhappy") ||
    n.includes("private")
  ) {
    return "negative";
  }
  if (n.includes("clicked") || n.includes("link")) return "clicked";
  // "Asked for review" and anything else = asked, no click yet.
  return "pending";
}

// Pick the review pipeline. Prefer a name match; fall back to a pipeline whose
// stages look like the review gate (both a click and a positive-outcome stage),
// so a rename that drops the word "review" still resolves.
export function resolveReviewPipeline(
  pipes: PipelinesResponse["pipelines"],
): PipelinesResponse["pipelines"][number] | null {
  const byName = pipes.find(
    (p) => norm(p.name).includes("review") || norm(p.name).includes("reputation"),
  );
  if (byName) return byName;
  const bySignature = pipes.find(
    (p) =>
      p.stages.some((s) => classifyReviewStage(s.name) === "positive") &&
      p.stages.some((s) => classifyReviewStage(s.name) === "clicked"),
  );
  return bySignature ?? null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Pure roll-up: given the resolved pipeline and its opportunities, produce the
// funnel counts and the recent-positive list. Exported so the branching math is
// unit-tested without touching GHL.
export function rollupReviewFunnel(
  pipe: PipelinesResponse["pipelines"][number],
  opps: GhlOpportunity[],
): ReviewFunnelData {
  const stageBucket = new Map<string, ReviewStageBucket>();
  const stageName = new Map<string, string>();
  for (const s of pipe.stages) {
    stageBucket.set(s.id, classifyReviewStage(s.name));
    stageName.set(s.id, s.name);
  }

  let pending = 0;
  let clicked = 0;
  let positive = 0;
  let negative = 0;
  for (const o of opps) {
    const bucket = stageBucket.get(o.pipelineStageId ?? "") ?? "pending";
    if (bucket === "positive") positive += 1;
    else if (bucket === "negative") negative += 1;
    else if (bucket === "clicked") clicked += 1;
    else pending += 1;
  }

  const recent = opps
    .filter((o) => stageBucket.get(o.pipelineStageId ?? "") === "positive")
    .sort((a, b) =>
      (b.lastStatusChangeAt ?? b.updatedAt ?? "").localeCompare(
        a.lastStatusChangeAt ?? a.updatedAt ?? "",
      ),
    )
    .slice(0, 5)
    .map((o) => {
      const c = o.contact ?? {};
      const name =
        c.name ||
        [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
        o.name ||
        "Customer";
      return {
        name,
        sub: "Left a Google review",
        initials: initialsOf(name),
      };
    });

  return {
    asked: opps.length,
    // Cumulative: everyone who clicked is those still in the click stage plus
    // both post-click outcomes.
    clicked: clicked + positive + negative,
    positive,
    negative,
    pending,
    recent,
  };
}

// GET /api/reviews/funnel: the Google Reviews pipeline rolled up into a request
// -> click -> review funnel, with the negative-feedback branch and a few recent
// positive submissions.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipe = resolveReviewPipeline(pipeData.pipelines ?? []);
  if (!pipe) {
    return Response.json({
      asked: 0,
      clicked: 0,
      positive: 0,
      negative: 0,
      pending: 0,
      recent: [],
      configError: "pipeline_not_found",
    } satisfies ReviewFunnelData);
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: pipe.id });
  return Response.json(rollupReviewFunnel(pipe, opps) satisfies ReviewFunnelData);
};
