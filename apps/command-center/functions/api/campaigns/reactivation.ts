import type { Env, ApiData } from "../../lib/env";
import { ghlJson, fetchAllOpportunities, type GhlContext } from "../../lib/ghl";

// The client-facing Reactivation surface layers over the always-on GHL
// "Database Reactivation" pipeline: dormant past customers the campaign texts +
// emails to win back. IDs differ per tenant, so resolve the pipeline BY NAME
// (exact, then a looser "reactivation" contains, then the known Willis id as a
// last resort), never hardcode. Same name-resolution pattern as
// functions/api/reviews/index.ts and functions/api/sales/jobs.ts.
const PIPELINE_NAME = "database reactivation";
const PIPELINE_ID_FALLBACK = "A7PNIqk4Fg1HINtirAmR";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

// The four buckets the surface shows, each a plain-English roll-up of the real
// pipeline stages. A stage the campaign hasn't reached a reply on (Lead
// Contacted / No answer / No Show) counts as "no answer yet".
type Bucket = "replied" | "booked" | "noAnswer" | "notFit";

export interface ReactivationData {
  // Everyone the campaign has contacted (all opportunities in the pipeline).
  reached: number;
  replied: number;
  booked: number;
  noAnswer: number;
  notFit: number;
  // A few most-recently won-back customers (booked an estimate), newest first.
  recent: { name: string; sub: string; initials: string }[];
  // Present when the pipeline could not be resolved for the tenant; the surface
  // then shows its honest not-connected state instead of zeros-as-data.
  configError?: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Classify a real stage name into one of the four surface buckets. Booked (the
// win) takes priority, then Not-a-fit, then any explicit reply/follow-up; every
// other stage (contacted, no answer, no show) reads as "reached, no reply yet".
function bucketForStage(stageName: string): Bucket {
  const n = norm(stageName);
  if (
    n.includes("estimate scheduled") ||
    n.includes("apt completed") ||
    n.includes("quote given") ||
    n.includes("booked")
  ) {
    return "booked";
  }
  if (n.includes("not qualified") || n.includes("not a fit")) return "notFit";
  if (
    n.includes("responded") ||
    n.includes("replied") ||
    n.includes("follow up") ||
    n.includes("followup")
  ) {
    return "replied";
  }
  return "noAnswer";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function empty(configError: string): ReactivationData {
  return { reached: 0, replied: 0, booked: 0, noAnswer: 0, notFit: 0, recent: [], configError };
}

// GET /api/campaigns/reactivation: the Database Reactivation pipeline rolled up
// into the surface's four buckets plus the reached total and recent win-backs.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const pipes = pipeData.pipelines ?? [];
  const pipe =
    pipes.find((p) => norm(p.name) === PIPELINE_NAME) ??
    pipes.find((p) => norm(p.name).includes("reactivation")) ??
    pipes.find((p) => p.id === PIPELINE_ID_FALLBACK);
  if (!pipe) return Response.json(empty("pipeline_not_found"));

  const stageBucket = new Map<string, Bucket>();
  const stageName = new Map<string, string>();
  for (const s of pipe.stages) {
    stageBucket.set(s.id, bucketForStage(s.name));
    stageName.set(s.id, s.name);
  }

  const opps = await fetchAllOpportunities(gctx, { pipelineId: pipe.id });

  let replied = 0;
  let booked = 0;
  let noAnswer = 0;
  let notFit = 0;
  for (const o of opps) {
    const bucket = stageBucket.get(o.pipelineStageId ?? "") ?? "noAnswer";
    if (bucket === "replied") replied += 1;
    else if (bucket === "booked") booked += 1;
    else if (bucket === "notFit") notFit += 1;
    else noAnswer += 1;
  }

  const recent = opps
    .filter((o) => stageBucket.get(o.pipelineStageId ?? "") === "booked")
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
        sub: stageName.get(o.pipelineStageId ?? "") ?? "Won back",
        initials: initialsOf(name),
      };
    });

  return Response.json({
    reached: opps.length,
    replied,
    booked,
    noAnswer,
    notFit,
    recent,
  } satisfies ReactivationData);
};
