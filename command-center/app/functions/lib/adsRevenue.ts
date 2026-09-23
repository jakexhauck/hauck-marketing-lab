import { dateStringInZone } from "./tz";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
  type GhlOpportunity,
} from "./ghl";

// The GHL join behind the Paid Ads Overview's "New customers", "Revenue from
// ads" and "Your return" (ROAS) tiles. Meta can tell us spend and leads, but for
// a lead-gen business only GHL knows which of those leads became a paid job.
//
// Jake's real GHL flow: the lead runs through the Paid Ad's Pipeline, then the
// Sales Pipeline, and when the job is done it lands in Job Completed with the
// job's dollar value on the opportunity. Every client is ads-only (Jake's call,
// 2026-09-23: no websites, no review funnels), so EVERY Job Completed
// opportunity is an ad-won customer and its revenue is its monetaryValue. There
// is deliberately no "facebook ads" tag check any more: the tagging workflow was
// never reliably built (5 of Willis's 199 contacts carried it), so the tag made
// real ad revenue read as zero.
//
// Windowed to the current month so it lines up with Meta's this-month spend and
// the ROAS reads honestly against it.

// How the completed-job pipeline + stage are found per tenant. IDs differ per
// client, so resolve by name, never hardcode. Exact match first, then a looser
// contains, mirroring functions/api/reviews.
const SALES_PIPELINE = "sales pipeline";
const JOB_COMPLETED_STAGE = "job completed";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

export interface AdRevenue {
  customers: number;
  revenue: number;
}

const ZERO: AdRevenue = { customers: 0, revenue: 0 };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// The completion instant of an opportunity: when it last changed stage (i.e.
// entered Job Completed), falling back to updated/created.
function completedAt(o: GhlOpportunity): string {
  return o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? "";
}

// Find the Sales pipeline and its Job Completed stage by name. Null if either is
// absent so the caller can degrade to honest zeros.
export function resolveCompletedStage(
  pipes: PipelinesResponse["pipelines"],
): { pipelineId: string; stageId: string } | null {
  const pipe =
    pipes.find((p) => norm(p.name) === SALES_PIPELINE) ??
    pipes.find((p) => norm(p.name).includes("sales"));
  if (!pipe) return null;
  const stage =
    pipe.stages.find((s) => norm(s.name) === JOB_COMPLETED_STAGE) ??
    pipe.stages.find((s) => norm(s.name).includes("job completed"));
  if (!stage) return null;
  return { pipelineId: pipe.id, stageId: stage.id };
}

// Pure core: the Job Completed opportunities that closed in `monthKey`
// (YYYY-MM, tenant-zone), newest first. Testable without any I/O.
export function completedInMonth(
  opps: GhlOpportunity[],
  stageId: string,
  monthKey: string,
  zone: string,
): GhlOpportunity[] {
  return opps
    .filter((o) => {
      if (o.pipelineStageId !== stageId) return false;
      const id = o.contactId ?? o.contact?.id;
      if (!id) return false;
      const ts = completedAt(o);
      if (!ts) return false;
      const ms = +new Date(ts);
      if (!Number.isFinite(ms)) return false;
      return dateStringInZone(zone, ms).slice(0, 7) === monthKey;
    })
    .sort((a, b) => +new Date(completedAt(b)) - +new Date(completedAt(a)));
}

// Pure core: tally customers + revenue from the completed opps.
export function tallyRevenue(adWon: GhlOpportunity[]): { customers: number; revenue: number } {
  let revenue = 0;
  for (const o of adWon) {
    revenue += typeof o.monetaryValue === "number" ? o.monetaryValue : 0;
  }
  return { customers: adWon.length, revenue: Math.round(revenue * 100) / 100 };
}

// The full join: this month's ad-won customers and their revenue for one tenant.
// Never throws for a "no data" situation (missing pipeline/stage => honest
// zeros); a hard GHL/network failure propagates to the caller, which degrades to
// zeros so Meta numbers still render.
export async function adRevenueThisMonth(
  gctx: GhlContext,
  zone: string,
  nowMs: number = Date.now(),
): Promise<AdRevenue> {
  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const resolved = resolveCompletedStage(pipeData.pipelines ?? []);
  if (!resolved) return ZERO;

  const monthKey = dateStringInZone(zone, nowMs).slice(0, 7);
  const opps = await fetchAllOpportunities(gctx, { pipelineId: resolved.pipelineId });
  const completed = completedInMonth(opps, resolved.stageId, monthKey, zone);
  return tallyRevenue(completed);
}
